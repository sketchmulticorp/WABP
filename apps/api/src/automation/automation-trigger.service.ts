import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import type { AutomationRun, AutomationRunState } from "./automation.types.js";
import { choices, keyword, optOutKeywords, record } from "./automation.validation.js";
import { automationEnabled } from "./automation-entitlement.policy.js";

/** Consumes persisted inbound messages, not raw provider or browser data. */
@Injectable()
export class AutomationTriggerService {
  constructor(
    private readonly flows: AutomationRepository,
    private readonly runs: AutomationRunRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly outbox: OutboxRepository,
  ) {}

  async inbound(messageId: string): Promise<void> {
    const inbound = await this.runs.inbound(messageId);
    if (inbound === undefined) return;
    await this.transactions.execute(async (tx) => {
      // Authoring serialization makes keyword publication/reactivation atomic with new-run selection.
      await this.flows.serialize(tx, inbound.tenantId);
      const conversation = await this.runs.conversation(
        tx,
        inbound.tenantId,
        inbound.conversationId,
      );
      if (conversation?.accountId !== inbound.accountId) return;
      if (!(await this.runs.claimInbound(tx, inbound.tenantId, inbound.conversationId, messageId)))
        return;
      const allowedAt = await this.runs.allowedAt(tx, inbound.tenantId, inbound.conversationId);
      if (allowedAt !== null && Date.parse(inbound.providerCreatedAt) <= Date.parse(allowedAt))
        return;
      let run = await this.runs.active(tx, inbound.tenantId, inbound.conversationId);
      const text =
        record(inbound.content.data) && typeof inbound.content.data.body === "string"
          ? keyword(inbound.content.data.body)
          : null;
      if (
        ["OPTED_OUT", "SUPPRESSED"].includes(conversation.consentStatus) ||
        (text !== null && optOutKeywords.has(text))
      ) {
        if (run !== undefined) await this.stop(tx, run, "CONTACT_MESSAGING_BLOCKED");
        return;
      }
      if (
        run?.status === "WAITING" &&
        run.state.expiresAt !== null &&
        Date.parse(run.state.expiresAt) <= Date.now()
      ) {
        await this.runs.update(tx, run, "CANCELLED", run.currentNodeId, {
          ...run.state,
          reason: "AUTOMATION_WAIT_EXPIRED",
        });
        await this.runs.state(tx, inbound.tenantId, inbound.conversationId, "NONE");
        await this.runs.runtimeAudit(
          tx,
          inbound.tenantId,
          run.id,
          "AUTOMATION_EXPIRED",
          "AUTOMATION_WAIT_EXPIRED",
        );
        run = undefined;
      }
      if (run !== undefined) {
        if (!automationEnabled(await this.flows.entitlement(tx, inbound.tenantId))) {
          await this.stop(tx, run, "AUTOMATION_NOT_ENTITLED");
          return;
        }
        if (run.status !== "WAITING" || conversation.automationState !== "ACTIVE") return;
        const version = await this.runs.version(tx, inbound.tenantId, run.flowVersionId);
        if (version?.flowStatus !== "ACTIVE") return;
        const graph = await this.flows.graph(tx, inbound.tenantId, run.flowVersionId);
        const ids = await this.runs.nodeIds(tx, inbound.tenantId, run.flowVersionId);
        const current = graph.nodes.find((n) => ids.get(n.key) === run.currentNodeId);
        const selection = interactiveSelection(inbound.content);
        if (selection !== null) {
          if (current === undefined || run.state.waitingMessageId === null) return;
          const sent = await this.runs.message(tx, inbound.tenantId, run.state.waitingMessageId);
          const option = choices(current).find(
            (c) => selection === choiceToken(run.id, current.key, c.id),
          );
          if (option === undefined) return;
          if (sent?.providerId === null && ["CREATED", "QUEUED", "SENDING"].includes(sent.status))
            throw new Error("AUTOMATION_ACCEPTANCE_PENDING");
          if (
            sent?.providerId === null ||
            sent?.providerId === undefined ||
            inbound.content.contextMessageId !== sent.providerId
          )
            return;
          const edge = graph.edges.find((e) => e.from === current.key && e.choice === option.id);
          const target = edge === undefined ? undefined : ids.get(edge.to);
          if (target === undefined) {
            await this.stop(tx, run, "AUTOMATION_TRANSITION_INVALID");
            return;
          }
          await this.runs.update(
            tx,
            run,
            "RUNNING",
            target,
            { ...run.state, waitingMessageId: null, expiresAt: null },
            messageId,
          );
          await this.queue(tx, inbound.tenantId, run.id);
          return;
        }
        if (inbound.messageType === "INTERACTIVE") return; // Stale/foreign choices never become text fallbacks.
        if (text !== null) {
          const entries = await this.runs.candidates(tx, inbound.tenantId, inbound.accountId);
          if (entries.some((entry) => entry.trigger.keywords.includes(text))) return; // Entry keywords never interrupt a pending choice.
        }
        await this.stop(tx, run, "AUTOMATION_UNEXPECTED_REPLY");
        return;
      }
      if (
        ["PAUSED", "HANDED_OFF"].includes(conversation.automationState) ||
        text === null ||
        inbound.messageType !== "TEXT"
      )
        return;
      const candidates = await this.runs.candidates(tx, inbound.tenantId, inbound.accountId);
      if (!automationEnabled(await this.flows.entitlement(tx, inbound.tenantId))) return;
      const matched = candidates.filter((c) => c.trigger.keywords.includes(text));
      if (matched.length !== 1) return;
      const candidate = matched[0];
      if (candidate === undefined) return;
      const version = await this.runs.version(tx, inbound.tenantId, candidate.versionId);
      // A replayed old message must not activate a flow published after that message.
      if (
        version?.publishedAt === null ||
        version?.publishedAt === undefined ||
        Date.parse(inbound.providerCreatedAt) < Date.parse(version.publishedAt)
      )
        return;
      const graph = await this.flows.graph(tx, inbound.tenantId, candidate.versionId);
      const ids = await this.runs.nodeIds(tx, inbound.tenantId, candidate.versionId);
      const start = graph.nodes.find((n) => n.type === "START");
      const nodeId = start === undefined ? undefined : ids.get(start.key);
      if (nodeId === undefined) return;
      const id = randomUUID();
      const state: AutomationRunState = {
        schemaVersion: 1,
        reason: null,
        visited: [],
        waitingMessageId: null,
        expiresAt: null,
      };
      await this.runs.create(tx, {
        id,
        tenantId: inbound.tenantId,
        versionId: candidate.versionId,
        conversationId: inbound.conversationId,
        nodeId,
        eventKey: messageId,
        state,
      });
      await this.runs.state(tx, inbound.tenantId, inbound.conversationId, "ACTIVE");
      await this.runs.runtimeAudit(tx, inbound.tenantId, id, "AUTOMATION_STARTED");
      await this.queue(tx, inbound.tenantId, id);
    });
  }
  async stop(tx: AppDatabaseTransaction, run: AutomationRun, reason: string) {
    await this.runs.update(tx, run, "HANDED_OFF", run.currentNodeId, { ...run.state, reason });
    await this.runs.state(tx, run.tenantId, run.conversationId, "HANDED_OFF");
    await this.runs.runtimeAudit(tx, run.tenantId, run.id, "AUTOMATION_HANDED_OFF", reason);
  }
  async queue(tx: AppDatabaseTransaction, tenantId: string, runId: string, availableAt?: string) {
    await this.outbox.create(tx, {
      aggregateId: runId,
      aggregateType: "automation_run",
      eventType: "automation.run.advance",
      payload: { run_id: runId },
      tenantId,
      correlationId: `automation:${runId}`,
      ...(availableAt === undefined ? {} : { availableAt }),
    });
  }
}
export function choiceToken(runId: string, nodeKey: string, choiceId: string) {
  return `a:${runId}:${nodeKey}:${choiceId}`;
}
function interactiveSelection(content: Record<string, unknown>): string | null {
  if (!record(content.data)) return null;
  const reply = content.data.button_reply ?? content.data.list_reply;
  return record(reply) && typeof reply.id === "string" ? reply.id : null;
}
