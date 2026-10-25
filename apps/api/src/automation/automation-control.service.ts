import { Injectable } from "@nestjs/common";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import {
  AutomationService,
  automationNotFound,
  conflict,
  detail,
  requireRevision,
} from "./automation.service.js";
import { validateGraph } from "./automation.validation.js";

/** Explicit ownership commands. Human takeover never silently restarts an old bot run. */
@Injectable()
export class AutomationControlService {
  constructor(
    private readonly flows: AutomationRepository,
    private readonly runs: AutomationRunRepository,
    private readonly authoring: AutomationService,
    private readonly transactions: DatabaseTransactionManager,
    private readonly scope: TenantScopeService,
  ) {}
  async status(context: AuthorizationContext, conversationId: string) {
    const tenantId = this.tenant(context, false);
    return this.transactions.execute(async (tx) => {
      const conversation = await this.runs.conversation(tx, tenantId, conversationId);
      if (conversation === undefined) throw conversationNotFound();
      return {
        automationState: conversation.automationState,
        run: await this.runs.latest(tx, tenantId, conversationId),
      };
    });
  }
  async conversation(context: AuthorizationContext, id: string, action: "takeover" | "allow") {
    const tenantId = this.tenant(context, true);
    return this.transactions.execute(async (tx) => {
      const conversation = await this.runs.conversation(tx, tenantId, id);
      if (conversation === undefined) throw conversationNotFound();
      if (action === "allow" && conversation.automationState === "ACTIVE")
        throw conflict(
          "AUTOMATION_TAKEOVER_REQUIRED",
          "Take over the active run before allowing future automation.",
        );
      const run = await this.runs.active(tx, tenantId, id);
      const next = action === "takeover" ? "HANDED_OFF" : "NONE";
      if (conversation.automationState === next)
        return { automationState: next, run: await this.runs.latest(tx, tenantId, id) };
      if (run !== undefined) {
        await this.runs.update(
          tx,
          run,
          action === "takeover" ? "HANDED_OFF" : "CANCELLED",
          run.currentNodeId,
          {
            ...run.state,
            reason: action === "takeover" ? "AUTOMATION_HUMAN_TAKEOVER" : "AUTOMATION_ALLOWED",
          },
        );
      }
      await this.runs.state(tx, tenantId, id, next);
      await this.runs.controlAudit(
        tx,
        context,
        tenantId,
        id,
        action === "takeover" ? "AUTOMATION_HUMAN_TAKEOVER" : "AUTOMATION_ALLOWED",
      );
      return { automationState: next, run: await this.runs.latest(tx, tenantId, id) };
    });
  }
  async flow(
    context: AuthorizationContext,
    id: string,
    expectedRevision: string,
    action: "pause" | "reactivate",
  ) {
    const tenantId = this.scope.requireTenantContext(context).tenantId;
    if (context.roleSystemKey !== "TENANT_ADMIN" || !context.permissions.has("automation.publish"))
      throw forbiddenError();
    return this.transactions.execute(async (tx) => {
      await this.flows.serialize(tx, tenantId);
      const flow = await this.flows.find(tenantId, id, tx);
      if (flow === undefined) throw automationNotFound();
      requireRevision(flow, expectedRevision);
      const published = flow.versions.find(
        (v) => v.id === flow.publishedVersionId && v.status === "PUBLISHED",
      );
      if (published === undefined)
        throw conflict("AUTOMATION_PUBLICATION_REQUIRED", "Publish a saved draft first.");
      if (action === "reactivate") {
        await this.authoring.requireEnabled(tx, tenantId);
        if (validateGraph(published.graph).length > 0)
          throw conflict("AUTOMATION_GRAPH_INVALID", "Publish a corrected draft.");
        await this.authoring.references(tx, tenantId, published.graph, true);
        await this.authoring.assertKeywords(tx, tenantId, id, published.graph);
        const publisher =
          published.publishedBy === null
            ? undefined
            : await this.runs.authorization(tx, tenantId, published.publishedBy);
        if (!publisher?.permissions.includes("automation.publish"))
          throw conflict(
            "AUTOMATION_PUBLISHER_ACCESS_CHANGED",
            "An active Admin must publish a new draft.",
          );
      }
      const next = action === "pause" ? "PAUSED" : "ACTIVE";
      if (flow.status === next) return detail(flow);
      await this.flows.setStatus(tx, tenantId, id, next);
      if (action === "pause")
        for (const row of await this.runs.flowConversations(tx, tenantId, id)) {
          const conversation = await this.runs.conversation(tx, tenantId, row.id);
          const run = await this.runs.active(tx, tenantId, row.id);
          if (
            conversation === undefined ||
            run === undefined ||
            !["RUNNING", "WAITING"].includes(run.status)
          )
            continue;
          await this.runs.update(tx, run, "PAUSED", run.currentNodeId, {
            ...run.state,
            reason: "AUTOMATION_FLOW_PAUSED",
          });
          await this.runs.state(tx, tenantId, row.id, "PAUSED");
          await this.runs.runtimeAudit(
            tx,
            tenantId,
            run.id,
            "AUTOMATION_PAUSED",
            "AUTOMATION_FLOW_PAUSED",
          );
        }
      await this.flows.audit(
        tx,
        context,
        tenantId,
        id,
        action === "pause" ? "AUTOMATION_FLOW_PAUSED" : "AUTOMATION_REACTIVATED",
      );
      const saved = await this.flows.find(tenantId, id, tx);
      if (saved === undefined) throw automationNotFound();
      return detail(saved);
    });
  }
  private tenant(context: AuthorizationContext, write: boolean) {
    const tenant = this.scope.requireTenantContext(context);
    if (
      !context.permissions.has("conversation.read") ||
      (write && !context.permissions.has("conversation.reply"))
    )
      throw forbiddenError();
    return tenant.tenantId;
  }
}
function conversationNotFound() {
  return new ApplicationError({
    code: "CONVERSATION_NOT_FOUND",
    message: "Conversation not found.",
    statusCode: 404,
  });
}
