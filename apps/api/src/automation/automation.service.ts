import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AutomationDetail, AutomationDraftInput } from "@whatsapp-platform/contracts";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { AutomationRepository } from "./automation.repository.js";
import type { AutomationRecord } from "./automation.types.js";
import { simulateGraph, validateGraph } from "./automation.validation.js";
import { automationEnabled } from "./automation-entitlement.policy.js";

/** Authoring policy: all mutations are serialized and audited; simulation has no side effects. */
@Injectable()
export class AutomationService {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly scope: TenantScopeService,
  ) {}

  async list(context: AuthorizationContext, after: string | null) {
    const tenantId = this.tenant(context, "automation.read");
    const rows = await this.repository.list(tenantId, after),
      page = rows.slice(0, 50);
    return { automations: page, nextCursor: rows.length > 50 ? (page.at(-1)?.id ?? null) : null };
  }
  async options(
    context: AuthorizationContext,
    accountCursor: string | null,
    memberCursor: string | null,
  ) {
    const rows = await this.repository.options(
      this.tenant(context, "automation.read"),
      accountCursor,
      memberCursor,
    );
    const accounts = rows.accounts.slice(0, 50),
      members = rows.members.slice(0, 50);
    return {
      accounts,
      members,
      accountCursor: rows.accounts.length > 50 ? (accounts.at(-1)?.id ?? null) : null,
      memberCursor: rows.members.length > 50 ? (members.at(-1)?.id ?? null) : null,
    };
  }
  async read(context: AuthorizationContext, id: string): Promise<AutomationDetail> {
    const flow = await this.repository.find(this.tenant(context, "automation.read"), id);
    if (flow === undefined) throw automationNotFound();
    return detail(flow);
  }
  async save(
    context: AuthorizationContext,
    id: string | null,
    input: AutomationDraftInput,
    expectedRevision: string | null,
  ) {
    const tenantId = this.tenant(context, "automation.write");
    return this.transactions.execute(async (tx) => {
      await this.repository.serialize(tx, tenantId);
      if (id === null) await this.requireEnabled(tx, tenantId);
      const flow = id === null ? undefined : await this.repository.find(tenantId, id, tx);
      if (id !== null && flow === undefined) throw automationNotFound();
      if (flow !== undefined) requireRevision(flow, expectedRevision);
      if (await this.repository.nameExists(tx, tenantId, input.name, id))
        throw conflict("AUTOMATION_NAME_EXISTS", "An automation with this name already exists.");
      await this.references(tx, tenantId, input.graph, false);
      const flowId = id ?? randomUUID();
      if (id === null) await this.repository.create(tx, context, tenantId, flowId, input.name);
      await this.repository.appendDraft(tx, tenantId, flowId, input.name, input.graph);
      await this.repository.audit(tx, context, tenantId, flowId, "AUTOMATION_DRAFT_SAVED");
      const saved = await this.repository.find(tenantId, flowId, tx);
      if (saved === undefined) throw automationNotFound();
      return detail(saved);
    });
  }
  async simulate(
    context: AuthorizationContext,
    id: string,
    expectedRevision: string,
    selections: readonly string[],
  ) {
    const tenantId = this.tenant(context, "automation.test");
    const flow = await this.repository.find(tenantId, id);
    if (flow === undefined) throw automationNotFound();
    requireRevision(flow, expectedRevision);
    const version =
      flow.versions.find((v) => v.status === "DRAFT") ??
      flow.versions.find((v) => v.id === flow.publishedVersionId);
    if (version === undefined) throw conflict("AUTOMATION_DRAFT_REQUIRED", "Save a flow first.");
    return simulateGraph(version.graph, selections);
  }
  async publish(context: AuthorizationContext, id: string, expectedRevision: string) {
    const tenantId = this.tenant(context, "automation.publish");
    if (context.roleSystemKey !== "TENANT_ADMIN") throw forbiddenError();
    return this.transactions.execute(async (tx) => {
      await this.repository.serialize(tx, tenantId);
      await this.requireEnabled(tx, tenantId);
      const flow = await this.repository.find(tenantId, id, tx);
      if (flow === undefined) throw automationNotFound();
      requireRevision(flow, expectedRevision);
      const version = flow.versions.find((v) => v.status === "DRAFT");
      if (version === undefined)
        throw conflict("AUTOMATION_DRAFT_REQUIRED", "Save a new draft before publishing.");
      const errors = validateGraph(version.graph);
      if (errors.length > 0)
        throw new ApplicationError({
          code: "AUTOMATION_GRAPH_INVALID",
          message: errors.join(" "),
          statusCode: 400,
        });
      await this.references(tx, tenantId, version.graph, true);
      await this.assertKeywords(tx, tenantId, id, version.graph);
      await this.repository.publish(tx, tenantId, id, version.id, context.actorId);
      await this.repository.audit(tx, context, tenantId, id, "AUTOMATION_PUBLISHED");
      const saved = await this.repository.find(tenantId, id, tx);
      if (saved === undefined) throw automationNotFound();
      return detail(saved);
    });
  }
  async assertKeywords(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    graph: AutomationDraftInput["graph"],
  ) {
    const active = await this.repository.activeTriggers(tx, tenantId, id);
    if (
      active.some(
        (t) =>
          t.accountId === graph.accountId && t.keywords.some((k) => graph.keywords.includes(k)),
      )
    )
      throw conflict(
        "AUTOMATION_KEYWORD_EXISTS",
        "Another active automation uses this account and keyword.",
      );
  }
  async requireEnabled(tx: AppDatabaseTransaction, tenantId: string) {
    if (!automationEnabled(await this.repository.entitlement(tx, tenantId)))
      throw conflict("AUTOMATION_NOT_ENTITLED", "The active subscription must enable automation.");
  }
  async references(
    tx: AppDatabaseTransaction,
    tenantId: string,
    graph: AutomationDraftInput["graph"],
    publishing: boolean,
  ) {
    if (!(await this.repository.accountExists(tx, tenantId, graph.accountId)))
      throw automationNotFound();
    if (publishing)
      for (const node of graph.nodes)
        if (
          node.type === "ASSIGN" &&
          !(await this.repository.memberExists(tx, tenantId, String(node.config.userId)))
        )
          throw conflict("AUTOMATION_ASSIGNEE_INVALID", "Choose an active team member.");
  }
  private tenant(context: AuthorizationContext, permission: string) {
    const tenant = this.scope.requireTenantContext(context);
    if (!context.permissions.has(permission)) throw forbiddenError();
    return tenant.tenantId;
  }
}
export function detail(flow: AutomationRecord): AutomationDetail {
  return {
    id: flow.id,
    name: flow.name,
    status: flow.status,
    publishedVersionId: flow.publishedVersionId,
    updatedAt: flow.updatedAt,
    revision: revisionOf(flow),
    versions: flow.versions.map((version) => ({
      id: version.id,
      number: version.number,
      status: version.status,
      publishedAt: version.publishedAt,
      graph: version.graph,
    })),
  };
}
export function revisionOf(flow: AutomationRecord) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        flow.id,
        flow.name,
        flow.status,
        flow.publishedVersionId,
        flow.updatedAt,
        flow.versions.map((v) => [v.id, v.status]),
      ]),
    )
    .digest("hex");
}
export function requireRevision(flow: AutomationRecord, expected: string | null) {
  if (expected !== revisionOf(flow))
    throw conflict(
      "AUTOMATION_REVISION_CHANGED",
      "This automation changed. Reload it before saving or publishing.",
    );
}
export function automationNotFound() {
  return new ApplicationError({
    code: "AUTOMATION_NOT_FOUND",
    message: "Automation not found.",
    statusCode: 404,
  });
}
export function conflict(code: string, message: string) {
  return new ApplicationError({ code, message, statusCode: 409 });
}
