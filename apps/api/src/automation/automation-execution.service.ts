import { Injectable } from "@nestjs/common";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import { AutomationTriggerService, choiceToken } from "./automation-trigger.service.js";
import { AUTOMATION_JOB_STEP_LIMIT, choices, validateGraph } from "./automation.validation.js";
import type { AutomationRun, AutomationRunState, RunStatus } from "./automation.types.js";
import { automationEnabled } from "./automation-entitlement.policy.js";

/** Pinned, transactional state machine. Provider submission remains the common delivery worker's job. */
@Injectable()
export class AutomationExecutionService {
  constructor(
    private readonly flows: AutomationRepository,
    private readonly runs: AutomationRunRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly messaging: MessagingService,
    private readonly messages: MessagingRepository,
    private readonly triggers: AutomationTriggerService,
  ) {}
  /** Terminal transport failure relinquishes bot ownership; provider acceptance is never retried here. */
  async fail(id: string) {
    const identity = await this.runs.runIdentity(id);
    if (identity === undefined) return;
    await this.transactions.execute(async (tx) => {
      const flow = await this.flows.find(
        identity.tenantId,
        identity.flowId,
        tx,
        identity.versionId,
      );
      if (flow === undefined) return;
      const conversation = await this.runs.conversation(
        tx,
        identity.tenantId,
        identity.conversationId,
      );
      const run = await this.runs.find(tx, identity.tenantId, id);
      if (
        conversation !== undefined &&
        run !== undefined &&
        ["RUNNING", "WAITING"].includes(run.status)
      )
        await this.handoff(tx, run, "AUTOMATION_EXECUTION_FAILED");
    });
  }

  async advance(id: string, eventId: string): Promise<void> {
    const identity = await this.runs.runIdentity(id);
    if (identity === undefined) return;
    await this.transactions.execute(async (tx) => {
      const flow = await this.flows.find(
        identity.tenantId,
        identity.flowId,
        tx,
        identity.versionId,
      );
      const version = flow?.versions.find(
        (v) => v.id === identity.versionId && v.status === "PUBLISHED",
      );
      if (flow === undefined || version === undefined) return;
      // Pre-acquire ALL possible node keys before the shared quota lock and Conversation lock.
      // Re-entering these locks inside MessagingService is safe and preserves Inbox's lock order.
      const now = new Date(),
        period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      await this.messages.acquireAutomationLocks(
        tx,
        identity.tenantId,
        version.graph.nodes.map((n) => messageKey(id, n.key)),
        period,
      );
      await this.runs.lockContact(tx, identity.tenantId, identity.conversationId);
      const conversation = await this.runs.conversation(
        tx,
        identity.tenantId,
        identity.conversationId,
      );
      const storedRun = await this.runs.find(tx, identity.tenantId, id);
      if (
        conversation === undefined ||
        storedRun === undefined ||
        !["RUNNING", "WAITING"].includes(storedRun.status)
      )
        return;
      let run: AutomationRun = storedRun;
      if (!(await this.runs.claimAdvance(tx, run.tenantId, id, eventId))) return;
      if (conversation.automationState !== "ACTIVE" || flow.status !== "ACTIVE") {
        await this.handoff(tx, run, "AUTOMATION_NOT_ACTIVE");
        return;
      }
      if (!automationEnabled(await this.flows.entitlement(tx, run.tenantId))) {
        await this.handoff(tx, run, "AUTOMATION_NOT_ENTITLED");
        return;
      }
      const failure = await this.runs.failedMessage(tx, run.tenantId, run.conversationId, id);
      if (failure !== null) {
        await this.handoff(tx, run, failure);
        return;
      }
      if (!["OPEN", "PENDING"].includes(conversation.status)) {
        await this.handoff(tx, run, "CONVERSATION_REOPEN_REQUIRED");
        return;
      }
      if (["OPTED_OUT", "SUPPRESSED"].includes(conversation.consentStatus)) {
        await this.handoff(tx, run, "CONTACT_MESSAGING_BLOCKED");
        return;
      }
      if (
        conversation.windowExpiresAt === null ||
        Date.parse(conversation.windowExpiresAt) <= Date.now()
      ) {
        await this.expire(tx, run);
        return;
      }
      if (version.publishedBy === null || validateGraph(version.graph).length > 0) {
        await this.handoff(tx, run, "AUTOMATION_VERSION_INVALID");
        return;
      }
      const actor = await this.runs.authorization(tx, identity.tenantId, version.publishedBy);
      if (!actor?.permissions.includes("automation.publish")) {
        await this.handoff(tx, run, "AUTOMATION_PUBLISHER_ACCESS_CHANGED");
        return;
      }
      const nodeIds = await this.runs.nodeIds(tx, identity.tenantId, version.id);
      let node = version.graph.nodes.find((n) => nodeIds.get(n.key) === run.currentNodeId),
        state = run.state;
      if (run.status === "WAITING") {
        if (state.expiresAt === null || Date.parse(state.expiresAt) <= Date.now()) {
          await this.expire(tx, run);
          return;
        }
        const pending =
          state.waitingMessageId === null
            ? undefined
            : await this.runs.message(tx, run.tenantId, state.waitingMessageId);
        if (pending === undefined || pending.status === "FAILED") {
          await this.handoff(tx, run, pending?.errorCode ?? "AUTOMATION_MESSAGE_MISSING");
          return;
        }
        await this.triggers.queue(
          tx,
          run.tenantId,
          id,
          pending.providerId === null ? later() : state.expiresAt,
        );
        return;
      }
      for (let steps = 0; steps < AUTOMATION_JOB_STEP_LIMIT; steps++) {
        if (node === undefined || state.visited.includes(node.key)) {
          await this.handoff(tx, run, "AUTOMATION_TRANSITION_INVALID", state);
          return;
        }
        const currentNodeId = nodeIds.get(node.key) ?? null;
        const nodeKey = node.key;
        if (run.currentNodeId !== currentNodeId) {
          await this.persist(tx, run, "RUNNING", currentNodeId, state);
          run = { ...run, currentNodeId, state, lockVersion: run.lockVersion + 1 };
        }
        if (state.waitingMessageId !== null) {
          const sent = await this.runs.message(tx, run.tenantId, state.waitingMessageId);
          if (sent === undefined || sent.status === "FAILED") {
            await this.handoff(tx, run, sent?.errorCode ?? "AUTOMATION_MESSAGE_MISSING", state);
            return;
          }
          if (sent.providerId === null) {
            await this.triggers.queue(tx, run.tenantId, id, later());
            return;
          }
          state = { ...state, waitingMessageId: null };
        } else if (node.type === "MESSAGE" || node.type === "BUTTONS" || node.type === "LIST") {
          try {
            const message = await this.messaging.createOutboundMessage(
              {
                actorId: actor.actorId,
                email: "",
                isPlatformActor: false,
                permissions: new Set(actor.permissions),
                requestId: `automation:${id}`,
                roleId: actor.roleId,
                roleName: actor.roleName,
                roleSystemKey: "TENANT_ADMIN",
                sessionId: "background",
                tenantId: run.tenantId,
              },
              {
                source: "AUTOMATION",
                clientMessageKey: messageKey(id, node.key),
                contactId: conversation.contactId,
                conversationId: conversation.id,
                whatsappAccountId: conversation.accountId,
                automation: {
                  runId: id,
                  versionId: version.id,
                  nodeKey: node.key,
                  publisherId: actor.actorId,
                },
                content:
                  node.type === "MESSAGE"
                    ? { type: "TEXT", text: String(node.config.text) }
                    : {
                        type: "INTERACTIVE",
                        kind: node.type,
                        text: String(node.config.text),
                        choices: choices(node).map((c) => ({
                          id: choiceToken(id, nodeKey, c.id),
                          title: c.title,
                        })),
                      },
              },
              tx,
              now,
            );
            state = {
              ...state,
              waitingMessageId: message.id,
              expiresAt: conversation.windowExpiresAt,
            };
            const status = node.type === "MESSAGE" ? "RUNNING" : "WAITING";
            if (status === "WAITING") state = { ...state, visited: [...state.visited, node.key] };
            await this.persist(tx, run, status, nodeIds.get(node.key) ?? null, state);
            await this.triggers.queue(tx, run.tenantId, id, later());
            return;
          } catch (error) {
            if (!(error instanceof ApplicationError)) throw error;
            await this.handoff(tx, run, error.code, state);
            return;
          }
        } else if (node.type === "ASSIGN") {
          const member = String(node.config.userId);
          if (!(await this.flows.memberExists(tx, run.tenantId, member))) {
            await this.handoff(tx, run, "AUTOMATION_ASSIGNEE_INVALID", state);
            return;
          }
          await this.runs.assign(tx, run.tenantId, conversation.id, member);
          await this.runs.runtimeAudit(tx, run.tenantId, id, "AUTOMATION_ASSIGNED");
        } else if (node.type === "CONTACT_UPDATE") {
          await this.runs.contactUpdate(
            tx,
            run.tenantId,
            conversation.contactId,
            Object.fromEntries(
              Object.entries(node.config.fields as Record<string, string>).map(([key, value]) => [
                key,
                key === "email" ? value.trim().toLowerCase() : value.trim(),
              ]),
            ),
          );
          await this.runs.runtimeAudit(tx, run.tenantId, id, "AUTOMATION_CONTACT_UPDATED");
        } else if (node.type === "HUMAN_HANDOFF") {
          await this.handoff(tx, run, "AUTOMATION_REQUESTED_HANDOFF", state);
          return;
        } else if (node.type === "END") {
          await this.persist(tx, run, "COMPLETED", nodeIds.get(node.key) ?? null, {
            ...state,
            visited: [...state.visited, node.key],
            reason: null,
          });
          await this.runs.state(tx, run.tenantId, conversation.id, "NONE");
          await this.runs.runtimeAudit(tx, run.tenantId, id, "AUTOMATION_COMPLETED");
          return;
        }
        state = { ...state, visited: [...state.visited, node.key] };
        const next = version.graph.edges.find((e) => e.from === node?.key && e.choice === null);
        node = next === undefined ? undefined : version.graph.nodes.find((n) => n.key === next.to);
      }
      if (node === undefined) {
        await this.handoff(tx, run, "AUTOMATION_TRANSITION_INVALID", state);
        return;
      }
      await this.persist(tx, run, "RUNNING", nodeIds.get(node.key) ?? null, state);
      await this.triggers.queue(tx, run.tenantId, id);
    });
  }
  private persist(
    tx: AppDatabaseTransaction,
    run: AutomationRun,
    status: RunStatus,
    nodeId: string | null,
    state: AutomationRunState,
  ) {
    return this.runs.update(tx, run, status, nodeId, state);
  }
  private async handoff(
    tx: AppDatabaseTransaction,
    run: AutomationRun,
    reason: string,
    state = run.state,
  ) {
    await this.runs.update(tx, run, "HANDED_OFF", run.currentNodeId, { ...state, reason });
    await this.runs.state(tx, run.tenantId, run.conversationId, "HANDED_OFF");
    await this.runs.runtimeAudit(tx, run.tenantId, run.id, "AUTOMATION_HANDED_OFF", reason);
  }
  private async expire(tx: AppDatabaseTransaction, run: AutomationRun) {
    await this.runs.update(tx, run, "CANCELLED", run.currentNodeId, {
      ...run.state,
      reason: "AUTOMATION_WAIT_EXPIRED",
    });
    await this.runs.state(tx, run.tenantId, run.conversationId, "NONE");
    await this.runs.runtimeAudit(
      tx,
      run.tenantId,
      run.id,
      "AUTOMATION_EXPIRED",
      "AUTOMATION_WAIT_EXPIRED",
    );
  }
}
function messageKey(runId: string, nodeKey: string) {
  return `automation:${runId}:${nodeKey}`;
}
function later() {
  return new Date(Date.now() + 5000).toISOString();
}
