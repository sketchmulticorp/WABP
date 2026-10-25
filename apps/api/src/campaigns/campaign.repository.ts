import { Inject, Injectable } from "@nestjs/common";
import type { CampaignDraftInput } from "@whatsapp-platform/contracts";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  campaignPreflightRunsInApp as preflightRuns,
  campaignRecipientsInApp as recipients,
  campaignsInApp as campaigns,
  contactGroupsInApp as groups,
  contactsInApp as contacts,
  templatesInApp as templates,
  whatsappAccountsInApp as accounts,
} from "../database/schema/index.js";

@Injectable()
export class CampaignRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  list(tenantId: string, cursor?: string) {
    return this.database
      .select(projection())
      .from(campaigns)
      .where(
        and(
          eq(campaigns.tenantId, tenantId),
          eq(campaigns.isDeleted, false),
          cursor === undefined ? undefined : gt(campaigns.id, cursor),
        ),
      )
      .orderBy(campaigns.id)
      .limit(51);
  }
  async find(tenantId: string, id: string) {
    const rows = await this.database
      .select(projection())
      .from(campaigns)
      .where(active(tenantId, id))
      .limit(1);
    return rows[0];
  }
  async lock(transaction: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await transaction
      .select(projection())
      .from(campaigns)
      .where(active(tenantId, id))
      .for("update");
    return rows[0];
  }
  async references(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: CampaignDraftInput,
  ) {
    const template = await transaction
      .select({ id: templates.id, contentVersion: templates.contentVersion })
      .from(templates)
      .innerJoin(
        accounts,
        and(
          eq(accounts.id, templates.whatsappAccountId),
          eq(accounts.tenantId, templates.tenantId),
        ),
      )
      .where(
        and(
          eq(templates.tenantId, tenantId),
          eq(templates.id, input.templateId),
          eq(templates.whatsappAccountId, input.whatsappAccountId),
          eq(templates.isDeleted, false),
        ),
      )
      .limit(1);
    const contactRows =
      input.audienceDefinition.contactIds.length === 0
        ? []
        : await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.tenantId, tenantId),
                eq(contacts.isDeleted, false),
                inArray(contacts.id, [...input.audienceDefinition.contactIds]),
              ),
            );
    const groupRows =
      input.audienceDefinition.groupIds.length === 0
        ? []
        : await transaction
            .select({ id: groups.id })
            .from(groups)
            .where(
              and(
                eq(groups.tenantId, tenantId),
                eq(groups.isDeleted, false),
                inArray(groups.id, [...input.audienceDefinition.groupIds]),
              ),
            );
    return {
      templateFound: template.length === 1,
      contactCount: contactRows.length,
      groupCount: groupRows.length,
      templateContentVersion: template[0]?.contentVersion ?? null,
    };
  }
  async create(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    actorId: string,
    input: CampaignDraftInput,
    approvalStatus: string,
  ) {
    const rows = await transaction
      .insert(campaigns)
      .values({
        ...draftValues(input),
        tenantId,
        createdBy: actorId,
        status: "DRAFT",
        approvalStatus,
      })
      .returning(projection());
    return rows[0];
  }
  async update(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    input: CampaignDraftInput,
    version: number,
    approvalStatus: string,
    changed: boolean,
  ) {
    const rows = await transaction
      .update(campaigns)
      .set({
        ...draftValues(input),
        updatedAt: new Date().toISOString(),
        ...(changed
          ? {
              contentVersion: version + 1,
              approvalStatus,
              approvalRequestedBy: null,
              approvalRequestedAt: null,
              reviewedBy: null,
              reviewedAt: null,
              approvedVersion: null,
              approvalRejectionReason: null,
              templateContentVersion: null,
            }
          : {}),
      })
      .where(
        and(
          active(tenantId, id),
          eq(campaigns.contentVersion, version),
          eq(campaigns.status, "DRAFT"),
        ),
      )
      .returning(projection());
    return rows[0];
  }
  async invalidatePreflight(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    campaignId: string,
  ) {
    await transaction
      .update(preflightRuns)
      .set({ status: "SUPERSEDED", completedAt: new Date().toISOString() })
      .where(
        and(
          eq(preflightRuns.tenantId, tenantId),
          eq(preflightRuns.campaignId, campaignId),
          inArray(preflightRuns.status, ["QUEUED", "PROCESSING"]),
        ),
      );
    await transaction
      .delete(recipients)
      .where(and(eq(recipients.tenantId, tenantId), eq(recipients.campaignId, campaignId)));
  }
  async activePreflight(transaction: AppDatabaseTransaction, tenantId: string, campaignId: string) {
    const rows = await transaction
      .select(preflightProjection())
      .from(preflightRuns)
      .where(
        and(
          eq(preflightRuns.tenantId, tenantId),
          eq(preflightRuns.campaignId, campaignId),
          inArray(preflightRuns.status, ["QUEUED", "PROCESSING"]),
        ),
      )
      .limit(1);
    return rows[0];
  }
  async createPreflight(
    transaction: AppDatabaseTransaction,
    input: {
      tenantId: string;
      campaignId: string;
      contentVersion: number;
      actorId: string;
      requestId: string;
    },
  ) {
    const rows = await transaction
      .insert(preflightRuns)
      .values({
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        contentVersion: input.contentVersion,
        status: "QUEUED",
        requestedBy: input.actorId,
        requestId: input.requestId,
      })
      .returning(preflightProjection());
    return rows[0];
  }
  async findPreflight(tenantId: string, campaignId: string, runId?: string) {
    const rows = await this.database
      .select(preflightProjection())
      .from(preflightRuns)
      .where(
        and(
          eq(preflightRuns.tenantId, tenantId),
          eq(preflightRuns.campaignId, campaignId),
          runId === undefined ? undefined : eq(preflightRuns.id, runId),
        ),
      )
      .orderBy(desc(preflightRuns.createdAt))
      .limit(1);
    return rows[0];
  }
  async options(tenantId: string) {
    const accountRows = await this.database
      .select({
        id: accounts.id,
        displayPhoneNumber: accounts.displayPhone,
        status: accounts.status,
      })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId));
    const templateRows = await this.database
      .select({
        id: templates.id,
        whatsappAccountId: templates.whatsappAccountId,
        name: templates.name,
        language: templates.language,
        providerStatus: templates.providerStatus,
        approvalStatus: templates.approvalStatus,
        components: templates.components,
      })
      .from(templates)
      .where(and(eq(templates.tenantId, tenantId), eq(templates.isDeleted, false)))
      .orderBy(templates.name);
    const groupRows = await this.database
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(eq(groups.tenantId, tenantId), eq(groups.isDeleted, false)))
      .orderBy(groups.name);
    return { accounts: accountRows, templates: templateRows, groups: groupRows };
  }
  async audit(
    transaction: AppDatabaseTransaction,
    input: {
      tenantId: string;
      actorId: string;
      actorRole: string;
      requestId: string;
      entityId: string;
      action: string;
      contentVersion: number;
      approvalStatus: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      ...input,
      entityType: "campaign",
      result: "SUCCESS",
      metadata: { content_version: input.contentVersion, approval_status: input.approvalStatus },
    });
  }
}
function preflightProjection() {
  return {
    id: preflightRuns.id,
    campaignId: preflightRuns.campaignId,
    contentVersion: preflightRuns.contentVersion,
    status: preflightRuns.status,
    blockers: preflightRuns.blockers,
    estimates: preflightRuns.estimates,
    errorCode: preflightRuns.errorCode,
    createdAt: preflightRuns.createdAt,
    startedAt: preflightRuns.startedAt,
    completedAt: preflightRuns.completedAt,
  };
}
function draftValues(input: CampaignDraftInput): CampaignDraftInput {
  return {
    name: input.name,
    description: input.description,
    whatsappAccountId: input.whatsappAccountId,
    templateId: input.templateId,
    audienceDefinition: input.audienceDefinition,
    variableMapping: input.variableMapping,
    scheduleAt: input.scheduleAt ?? null,
    scheduleTimezone: input.scheduleTimezone ?? "UTC",
  };
}
function active(tenantId: string, id: string) {
  return and(
    eq(campaigns.tenantId, tenantId),
    eq(campaigns.id, id),
    eq(campaigns.isDeleted, false),
  );
}
function projection() {
  return {
    id: campaigns.id,
    name: campaigns.name,
    description: campaigns.description,
    whatsappAccountId: campaigns.whatsappAccountId,
    templateId: campaigns.templateId,
    audienceDefinition: campaigns.audienceDefinition,
    variableMapping: campaigns.variableMapping,
    scheduleAt: campaigns.scheduleAt,
    scheduleTimezone: campaigns.scheduleTimezone,
    templateContentVersion: campaigns.templateContentVersion,
    approvalRequestedBy: campaigns.approvalRequestedBy,
    approvalRejectionReason: campaigns.approvalRejectionReason,
    pauseReason: campaigns.pauseReason,
    status: campaigns.status,
    contentVersion: campaigns.contentVersion,
    approvalStatus: campaigns.approvalStatus,
    approvedVersion: campaigns.approvedVersion,
    createdAt: campaigns.createdAt,
    updatedAt: campaigns.updatedAt,
  };
}
