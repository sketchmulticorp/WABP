import { Inject, Injectable, Optional } from "@nestjs/common";
import { DEPLOYMENT_MODE, type DeploymentMode } from "../common/deployment-mode.js";
import type { CampaignDraftInput } from "@whatsapp-platform/contracts";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import type { UpdateCampaignInput } from "./campaign.dto.js";
import { CampaignRepository } from "./campaign.repository.js";
import { campaignRevision, canonical } from "./campaign-revision.js";

/** Draft operations have no send/queue side effects. Services own version and approval rules. */
@Injectable()
export class CampaignService {
  constructor(
    private readonly repository: CampaignRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
    private readonly outbox: OutboxRepository,
    @Optional() @Inject(DEPLOYMENT_MODE) private readonly deploymentMode: DeploymentMode = "full",
  ) {}
  async list(context: AuthorizationContext, cursor?: string) {
    const rows = await this.repository.list(this.scope(context, "campaign.read"), cursor);
    return {
      campaigns: rows
        .slice(0, 50)
        .map((campaign) => ({ ...campaign, revision: campaignRevision(campaign) })),
      nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
    };
  }
  async read(context: AuthorizationContext, id: string) {
    const campaign = await this.repository.find(this.scope(context, "campaign.read"), id);
    if (campaign === undefined) throw failure("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
    return { ...campaign, revision: campaignRevision(campaign) };
  }
  options(context: AuthorizationContext) {
    return this.repository.options(this.scope(context, "campaign.read"));
  }
  create(context: AuthorizationContext, input: CampaignDraftInput) {
    const tenantId = this.scope(context, "campaign.write");
    return this.transactions.execute(async (transaction) => {
      await this.validateReferences(transaction, tenantId, input);
      const campaign = await this.repository.create(
        transaction,
        tenantId,
        context.actorId,
        input,
        this.approval(context),
      );
      if (campaign === undefined) throw new Error("Campaign insert returned no row.");
      await this.audit(transaction, context, tenantId, campaign, "CAMPAIGN_DRAFT_CREATED");
      return { ...campaign, revision: campaignRevision(campaign) };
    });
  }
  update(context: AuthorizationContext, id: string, input: UpdateCampaignInput) {
    const tenantId = this.scope(context, "campaign.write");
    return this.transactions.execute(async (transaction) => {
      // Serialize read/compare/write so two requests cannot both accept one material version.
      const existing = await this.repository.lock(transaction, tenantId, id);
      if (existing === undefined) throw failure("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
      if (existing.status !== "DRAFT")
        throw failure("CAMPAIGN_NOT_EDITABLE", "Only draft campaigns can be edited.", 409);
      if (
        existing.contentVersion !== input.expectedContentVersion ||
        campaignRevision(existing) !== input.expectedRevision
      )
        throw failure(
          "CAMPAIGN_VERSION_CONFLICT",
          "This campaign changed. Reload it before saving.",
          409,
        );
      const references = await this.validateReferences(transaction, tenantId, input);
      const changed =
        existing.whatsappAccountId !== input.whatsappAccountId ||
        existing.templateId !== input.templateId ||
        canonical(existing.audienceDefinition) !== canonical(input.audienceDefinition) ||
        canonical(existing.variableMapping) !== canonical(input.variableMapping) ||
        (existing.templateContentVersion !== null &&
          existing.templateContentVersion !== references.templateContentVersion);
      const materialChanged =
        changed ||
        (existing.scheduleAt === null ? null : Date.parse(existing.scheduleAt)) !==
          (input.scheduleAt == null ? null : Date.parse(input.scheduleAt)) ||
        existing.scheduleTimezone !== (input.scheduleTimezone ?? "UTC");
      const campaign = await this.repository.update(
        transaction,
        tenantId,
        id,
        input,
        existing.contentVersion,
        this.approval(context),
        materialChanged,
      );
      if (campaign === undefined)
        throw failure(
          "CAMPAIGN_VERSION_CONFLICT",
          "This campaign changed. Reload it before saving.",
          409,
        );
      if (materialChanged) await this.repository.invalidatePreflight(transaction, tenantId, id);
      await this.audit(
        transaction,
        context,
        tenantId,
        campaign,
        materialChanged ? "CAMPAIGN_MATERIAL_UPDATED" : "CAMPAIGN_METADATA_UPDATED",
      );
      return { ...campaign, revision: campaignRevision(campaign) };
    });
  }
  preflight(context: AuthorizationContext, id: string) {
    const tenantId = this.scope(context, "campaign.write");
    // Never persist queued work when this deployment has no consumer.
    if (this.deploymentMode === "preview")
      throw failure(
        "BACKGROUND_PROCESSING_UNAVAILABLE",
        "Recipient checks require background processing.",
        503,
      );
    return this.transactions.execute(async (transaction) => {
      const campaign = await this.repository.lock(transaction, tenantId, id);
      if (campaign === undefined) throw failure("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
      if (campaign.status !== "DRAFT")
        throw failure("CAMPAIGN_NOT_PREFLIGHTABLE", "Only draft campaigns can be checked.", 409);
      const active = await this.repository.activePreflight(transaction, tenantId, id);
      if (active !== undefined) return presentPreflight(active);
      const run = await this.repository.createPreflight(transaction, {
        tenantId,
        campaignId: id,
        contentVersion: campaign.contentVersion,
        actorId: context.actorId,
        requestId: context.requestId,
      });
      if (run === undefined) throw new Error("Preflight insert returned no row.");
      await this.outbox.create(transaction, {
        tenantId,
        aggregateId: run.id,
        aggregateType: "campaign_preflight",
        correlationId: run.id,
        eventType: "campaign.preflight.queued",
        payload: { campaign_preflight_run_id: run.id },
      });
      await this.repository.audit(transaction, {
        tenantId,
        actorId: context.actorId,
        actorRole: context.roleSystemKey,
        requestId: context.requestId,
        entityId: id,
        action: "CAMPAIGN_PREFLIGHT_REQUESTED",
        contentVersion: campaign.contentVersion,
        approvalStatus: campaign.approvalStatus,
      });
      return presentPreflight(run);
    });
  }
  async preflightStatus(context: AuthorizationContext, campaignId: string, runId?: string) {
    const tenantId = this.scope(context, "campaign.read");
    const run = await this.repository.findPreflight(tenantId, campaignId, runId);
    if (run === undefined)
      throw failure("CAMPAIGN_PREFLIGHT_NOT_FOUND", "Campaign preflight not found.", 404);
    return presentPreflight(run);
  }
  private scope(context: AuthorizationContext, permission: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    if (!context.permissions.has(permission)) throw forbiddenError();
    return tenant.tenantId;
  }
  private approval(context: AuthorizationContext) {
    return context.roleSystemKey === "TENANT_ADMIN" ? "NOT_REQUIRED" : "DRAFT";
  }
  private async validateReferences(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: CampaignDraftInput,
  ) {
    const found = await this.repository.references(transaction, tenantId, input);
    if (
      !found.templateFound ||
      found.contactCount !== input.audienceDefinition.contactIds.length ||
      found.groupCount !== input.audienceDefinition.groupIds.length
    )
      throw failure(
        "CAMPAIGN_REFERENCE_NOT_FOUND",
        "An account, template or audience selection is unavailable in this workspace.",
        404,
      );
    return found;
  }
  private audit(
    transaction: AppDatabaseTransaction,
    context: AuthorizationContext,
    tenantId: string,
    campaign: { id: string; contentVersion: number; approvalStatus: string },
    action: string,
  ) {
    return this.repository.audit(transaction, {
      tenantId,
      actorId: context.actorId,
      actorRole: context.roleSystemKey,
      requestId: context.requestId,
      entityId: campaign.id,
      contentVersion: campaign.contentVersion,
      approvalStatus: campaign.approvalStatus,
      action,
    });
  }
}
function presentPreflight(run: {
  id: string;
  campaignId: string;
  contentVersion: number;
  status: string;
  blockers: unknown;
  estimates: unknown;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}) {
  const blockers = Array.isArray(run.blockers)
    ? run.blockers.filter((value): value is string => typeof value === "string")
    : [];
  const estimates =
    typeof run.estimates === "object" &&
    run.estimates !== null &&
    !Array.isArray(run.estimates) &&
    Object.keys(run.estimates).length > 0
      ? run.estimates
      : null;
  return { ...run, blockers, estimates };
}
function failure(code: string, message: string, statusCode: number) {
  return new ApplicationError({ code, message, statusCode });
}
