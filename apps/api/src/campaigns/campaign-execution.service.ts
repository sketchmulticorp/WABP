import { Injectable } from "@nestjs/common";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { CampaignExecutionRepository } from "./campaign-execution.repository.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { ApplicationError } from "../common/errors/application-error.js";

/** Runs inside worker processes; PostgreSQL rows are the durable scheduler and expansion cursor. */
@Injectable()
export class CampaignExecutionService {
  constructor(
    private readonly repository: CampaignExecutionRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly messaging: MessagingService,
    private readonly outbox: OutboxRepository,
  ) {}
  candidates() {
    return this.repository.candidates();
  }
  async advance(tenantId: string, id: string): Promise<void> {
    try {
      await this.transactions.execute(async (tx) => {
        const campaign = await this.repository.lock(tx, tenantId, id);
        if (campaign === undefined || !["QUEUED", "SCHEDULED", "RUNNING"].includes(campaign.status))
          return;
        const actor =
          campaign.deliveryRequestedBy === null
            ? undefined
            : await this.repository.authorization(tx, tenantId, campaign.deliveryRequestedBy);
        const reviewer =
          campaign.reviewedBy === null
            ? undefined
            : await this.repository.authorization(tx, tenantId, campaign.reviewedBy);
        const template = await this.repository.liveTemplate(
          tx,
          tenantId,
          campaign.templateId,
          campaign.whatsappAccountId,
        );
        let reason: string | null = null;
        if (
          actor === undefined ||
          !["TENANT_ADMIN", "TENANT_USER"].includes(actor.roleSystemKey) ||
          !actor.permissions.includes("campaign.send")
        )
          reason = "CAMPAIGN_SENDER_ACCESS_CHANGED";
        else if (
          campaign.approvalStatus !== "NOT_REQUIRED" &&
          !(
            campaign.approvalStatus === "APPROVED" &&
            campaign.approvedVersion === campaign.contentVersion &&
            reviewer?.roleSystemKey === "TENANT_ADMIN" &&
            reviewer.permissions.includes("campaign.approve")
          )
        )
          reason = "CAMPAIGN_APPROVAL_CHANGED";
        else if (template?.contentVersion !== campaign.templateContentVersion)
          reason = "CAMPAIGN_TEMPLATE_CHANGED";
        if (reason !== null || actor === undefined) {
          await this.repository.state(tx, tenantId, id, "PAUSED", reason);
          return;
        }
        if (campaign.finalPreflightId === null) {
          await this.queueFinal(tx, campaign);
          return;
        }
        const run = await this.repository.run(tx, tenantId, campaign.finalPreflightId);
        if (run === undefined || run.status === "FAILED" || run.status === "SUPERSEDED") {
          await this.repository.state(tx, tenantId, id, "PAUSED", "CAMPAIGN_PREFLIGHT_FAILED");
          return;
        }
        if (run.status === "QUEUED" || run.status === "PROCESSING") {
          await this.repository.touch(tx, tenantId, id);
          return;
        }
        if (
          run.contentVersion !== campaign.contentVersion ||
          !Array.isArray(run.blockers) ||
          run.blockers.length > 0
        ) {
          await this.repository.state(tx, tenantId, id, "PAUSED", "CAMPAIGN_PREFLIGHT_BLOCKED");
          return;
        }
        if (campaign.scheduleAt !== null && Date.parse(campaign.scheduleAt) > Date.now()) {
          await this.repository.state(tx, tenantId, id, "SCHEDULED");
          return;
        }
        // A scheduled campaign re-resolves the audience when due, before any message exists.
        if (campaign.status === "SCHEDULED" && campaign.startedAt === null) {
          await this.repository.state(tx, tenantId, id, "QUEUED");
          await this.queueFinal(tx, campaign);
          return;
        }
        const pending = await this.repository.pending(tx, tenantId, id);
        // Preserve the common composer lock order: all batch message keys before quota.
        await this.repository.lockMessageKeys(
          tx,
          tenantId,
          pending.map((row) => `campaign:${id}:${row.id}`),
        );
        const quota = await this.repository.remainingQuota(tx, tenantId, id);
        if (quota === undefined || Number(quota.remaining) < Number(quota.needed)) {
          await this.repository.state(tx, tenantId, id, "PAUSED", "MESSAGE_QUOTA_INSUFFICIENT");
          return;
        }
        if (campaign.status !== "RUNNING") await this.repository.state(tx, tenantId, id, "RUNNING");
        for (const recipient of pending) {
          const conversationId = await this.repository.conversation(
            tx,
            tenantId,
            campaign.whatsappAccountId,
            recipient.contactId,
          );
          const message = await this.messaging.createOutboundMessage(
            {
              actorId: actor.actorId,
              email: "",
              isPlatformActor: false,
              permissions: new Set(actor.permissions),
              requestId: `campaign:${id}`,
              roleId: actor.roleId,
              roleName: actor.roleName,
              roleSystemKey: actor.roleSystemKey as "TENANT_ADMIN" | "TENANT_USER",
              sessionId: "background",
              tenantId,
            },
            {
              campaignId: id,
              clientMessageKey: `campaign:${id}:${recipient.id}`,
              contactId: recipient.contactId,
              conversationId,
              whatsappAccountId: campaign.whatsappAccountId,
              source: "CAMPAIGN",
              content: {
                type: "TEMPLATE",
                templateId: campaign.templateId,
                variables: readVariables(recipient.renderedVariables),
              },
            },
            tx,
          );
          await this.repository.link(tx, tenantId, recipient.id, message.id);
        }
        if ((await this.repository.outstanding(tx, tenantId, id)) === 0)
          await this.repository.state(tx, tenantId, id, "COMPLETED");
        else await this.repository.touch(tx, tenantId, id);
        return;
      });
    } catch (error) {
      if (isPolicyError(error)) {
        await this.transactions.execute(async (tx) => {
          const row = await this.repository.lock(tx, tenantId, id);
          if (row !== undefined && ["QUEUED", "SCHEDULED", "RUNNING"].includes(row.status))
            await this.repository.state(tx, tenantId, id, "PAUSED", error.code);
        });
        return;
      }
      throw error;
    }
  }
  private async queueFinal(
    tx: AppDatabaseTransaction,
    campaign: NonNullable<Awaited<ReturnType<CampaignExecutionRepository["lock"]>>>,
  ) {
    const runId = await this.repository.createRun(tx, campaign);
    await this.outbox.create(tx, {
      tenantId: campaign.tenantId,
      aggregateId: runId,
      aggregateType: "campaign_preflight",
      correlationId: `campaign:${campaign.id}`,
      eventType: "campaign.preflight.queued",
      payload: { campaign_preflight_run_id: runId },
    });
  }
}
function readVariables(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid recipient variables");
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") throw new Error("Invalid recipient variables");
    result[key] = entry;
  }
  return result;
}
function isPolicyError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
