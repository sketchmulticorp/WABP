import { Inject, Injectable, Optional } from "@nestjs/common";
import { DEPLOYMENT_MODE, type DeploymentMode } from "../common/deployment-mode.js";
import { createHash } from "node:crypto";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { CampaignRepository } from "./campaign.repository.js";
import { CampaignService } from "./campaign.service.js";
import { CampaignLifecycleRepository } from "./campaign-lifecycle.repository.js";
import { campaignRevision } from "./campaign-revision.js";
import type { parseCampaignCommand } from "./campaign.dto.js";

type Command = ReturnType<typeof parseCampaignCommand>;
export type CampaignAction =
  "request-approval" | "approve" | "reject" | "send" | "schedule" | "pause" | "resume" | "cancel";

/** All state transitions serialize on the campaign; external delivery belongs to the worker. */
@Injectable()
export class CampaignLifecycleService {
  constructor(
    private readonly repository: CampaignLifecycleRepository,
    private readonly drafts: CampaignRepository,
    private readonly campaigns: CampaignService,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
    @Optional() @Inject(DEPLOYMENT_MODE) private readonly deploymentMode: DeploymentMode = "full",
  ) {}

  async command(
    context: AuthorizationContext,
    id: string,
    action: CampaignAction,
    command: Command,
  ) {
    const tenantId = this.tenantScope.requireTenantContext(context).tenantId;
    const permission =
      action === "cancel"
        ? "campaign.cancel"
        : action === "approve" || action === "reject"
          ? "campaign.approve"
          : ["send", "schedule", "resume", "pause"].includes(action)
            ? "campaign.send"
            : "campaign.write";
    if (!context.permissions.has(permission)) throw forbiddenError();
    if (
      this.deploymentMode === "preview" &&
      !["request-approval", "approve", "reject"].includes(action)
    )
      throw fail(
        "BACKGROUND_PROCESSING_UNAVAILABLE",
        "Delivery controls require background processing.",
        503,
      );
    await this.transactions.execute(async (tx) => {
      const projection = await this.drafts.lock(tx, tenantId, id);
      const campaign = await this.repository.lock(tx, tenantId, id);
      if (campaign === undefined || projection === undefined)
        throw fail("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
      const starting = action === "send" || action === "schedule";
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            action,
            version: command.expectedContentVersion,
            revision: command.expectedRevision,
          }),
        )
        .digest("hex");
      if (starting && campaign.startKey === command.idempotencyKey) {
        if (campaign.deliveryRequestedBy !== context.actorId)
          throw fail("CAMPAIGN_IDEMPOTENCY_CONFLICT", "This request belongs to another sender.");
        if (campaign.startHash !== hash)
          throw fail("CAMPAIGN_IDEMPOTENCY_CONFLICT", "This key was used for a different request.");
        return;
      }
      if (
        campaign.contentVersion !== command.expectedContentVersion ||
        (campaign.status === "DRAFT" && campaignRevision(projection) !== command.expectedRevision)
      )
        throw fail("CAMPAIGN_VERSION_CONFLICT", "Campaign changed. Reload before continuing.");
      const now = new Date().toISOString();
      if (action === "request-approval" || action === "approve" || action === "reject") {
        if (campaign.status !== "DRAFT")
          throw fail("CAMPAIGN_NOT_EDITABLE", "Only drafts can be reviewed.");
        if (action === "request-approval") {
          if (
            context.roleSystemKey !== "TENANT_USER" ||
            !["DRAFT", "REJECTED", "APPROVED"].includes(campaign.approvalStatus)
          )
            throw fail(
              "CAMPAIGN_APPROVAL_STATE_INVALID",
              "Campaign cannot be submitted in its current state.",
            );
          const template = await this.repository.template(
            tx,
            tenantId,
            campaign.templateId,
            campaign.whatsappAccountId,
          );
          if (template === undefined)
            throw fail("CAMPAIGN_TEMPLATE_UNAVAILABLE", "Template unavailable.");
          if (
            campaign.templateContentVersion !== null &&
            campaign.templateContentVersion !== template.contentVersion
          )
            throw fail(
              "CAMPAIGN_TEMPLATE_CHANGED",
              "Save the draft to create a new material version before resubmitting.",
            );
          await this.repository.update(tx, tenantId, id, {
            approvalStatus: "PENDING",
            approvalRequestedBy: context.actorId,
            approvalRequestedAt: now,
            reviewedBy: null,
            reviewedAt: null,
            approvedVersion: null,
            approvalRejectionReason: null,
            templateContentVersion: template.contentVersion,
          });
        } else {
          if (
            context.roleSystemKey !== "TENANT_ADMIN" ||
            campaign.approvalRequestedBy === context.actorId
          )
            throw forbiddenError();
          if (campaign.approvalStatus !== "PENDING")
            throw fail("CAMPAIGN_APPROVAL_STATE_INVALID", "Campaign is not awaiting review.");
          const template = await this.repository.template(
            tx,
            tenantId,
            campaign.templateId,
            campaign.whatsappAccountId,
          );
          if (action === "approve" && template?.contentVersion !== campaign.templateContentVersion)
            throw fail("CAMPAIGN_TEMPLATE_CHANGED", "Template changed. Request a new review.");
          await this.repository.update(tx, tenantId, id, {
            approvalStatus: action === "approve" ? "APPROVED" : "REJECTED",
            reviewedBy: context.actorId,
            reviewedAt: now,
            approvedVersion: action === "approve" ? campaign.contentVersion : null,
            approvalRejectionReason: action === "reject" ? command.reason : null,
          });
        }
      } else if (starting || action === "resume") {
        if (starting && campaign.status !== "DRAFT")
          throw fail("CAMPAIGN_ALREADY_STARTED", "Campaign already started.");
        if (action === "resume" && campaign.status !== "PAUSED")
          throw fail("CAMPAIGN_NOT_PAUSED", "Campaign is not paused.");
        if (
          campaign.approvalStatus !== "NOT_REQUIRED" &&
          !(
            campaign.approvalStatus === "APPROVED" &&
            campaign.approvedVersion === campaign.contentVersion
          )
        )
          throw fail(
            "CAMPAIGN_APPROVAL_REQUIRED",
            "The current campaign version requires Admin approval.",
          );
        const template = await this.repository.template(
          tx,
          tenantId,
          campaign.templateId,
          campaign.whatsappAccountId,
        );
        if (
          template === undefined ||
          (campaign.templateContentVersion !== null &&
            template.contentVersion !== campaign.templateContentVersion)
        )
          throw fail(
            "CAMPAIGN_TEMPLATE_CHANGED",
            "Template changed. Save and review the campaign again.",
          );
        if (
          action === "schedule" &&
          (campaign.scheduleAt === null || Date.parse(campaign.scheduleAt) <= Date.now())
        )
          throw fail(
            "CAMPAIGN_SCHEDULE_INVALID",
            "Save a future schedule before requesting approval.",
          );
        if (action === "send" && campaign.scheduleAt !== null)
          throw fail(
            "CAMPAIGN_SCHEDULE_MISMATCH",
            "This draft has a schedule. Use schedule or edit it before approval.",
          );
        await this.repository.update(tx, tenantId, id, {
          status: "QUEUED",
          templateContentVersion: template.contentVersion,
          pauseReason: null,
          ...(action === "resume" && campaign.startedAt === null ? { finalPreflightId: null } : {}),
          ...(starting
            ? {
                startKey: command.idempotencyKey ?? "",
                startHash: hash,
                deliveryRequestedBy: context.actorId,
              }
            : {}),
        });
      } else if (action === "pause") {
        if (!["SCHEDULED", "QUEUED", "RUNNING"].includes(campaign.status))
          throw fail("CAMPAIGN_NOT_RUNNING", "Campaign cannot be paused in this state.");
        await this.repository.update(tx, tenantId, id, {
          status: "PAUSED",
          pauseReason: "OWNER_PAUSED",
        });
      } else {
        if (!["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED"].includes(campaign.status))
          throw fail("CAMPAIGN_NOT_CANCELLABLE", "Campaign cannot be cancelled in this state.");
        await this.repository.update(tx, tenantId, id, {
          status: "CANCELLED",
          completedAt: now,
          pauseReason: "OWNER_CANCELLED",
        });
        await this.repository.cancelUnsent(tx, tenantId, id);
      }
      const after = await this.drafts.lock(tx, tenantId, id);
      await this.drafts.audit(tx, {
        tenantId,
        actorId: context.actorId,
        actorRole: context.roleSystemKey,
        requestId: context.requestId,
        entityId: id,
        action: `CAMPAIGN_${action.replaceAll("-", "_").toUpperCase()}`,
        contentVersion: campaign.contentVersion,
        approvalStatus: after?.approvalStatus ?? campaign.approvalStatus,
      });
    });
    return this.campaigns.read(context, id);
  }
  async report(context: AuthorizationContext, id: string, cursor?: string) {
    const tenantId = this.tenantScope.requireTenantContext(context).tenantId;
    if (!context.permissions.has("campaign.read")) throw forbiddenError();
    const campaign = await this.campaigns.read(context, id);
    const report = await this.repository.report(tenantId, id, cursor);
    return {
      campaign,
      ...report,
      finalPreflight:
        report.finalPreflight === null
          ? null
          : {
              ...report.finalPreflight,
              blockers: Array.isArray(report.finalPreflight.blockers)
                ? report.finalPreflight.blockers.filter(
                    (value): value is string => typeof value === "string",
                  )
                : [],
            },
    };
  }
}
function fail(code: string, message: string, statusCode = 409) {
  return new ApplicationError({ code, message, statusCode });
}
