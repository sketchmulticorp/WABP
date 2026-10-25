import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  providerCredentialsInApp,
  templatesInApp,
  whatsappAccountsInApp,
} from "../database/schema/index.js";
import type { TemplateContentInput } from "./template.dto.js";

@Injectable()
export class TemplateRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  list(tenantId: string) {
    return this.database
      .select(templateProjection())
      .from(templatesInApp)
      .where(and(eq(templatesInApp.tenantId, tenantId), eq(templatesInApp.isDeleted, false)))
      .orderBy(templatesInApp.name, templatesInApp.language);
  }

  async findActive(tenantId: string, templateId: string) {
    const rows = await this.database
      .select(templateProjection())
      .from(templatesInApp)
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.id, templateId),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findProviderAccount(tenantId: string, accountId: string) {
    const rows = await this.database
      .select({
        credentialReference: providerCredentialsInApp.secretRef,
        credentialStatus: providerCredentialsInApp.status,
        id: whatsappAccountsInApp.id,
        status: whatsappAccountsInApp.status,
        wabaId: whatsappAccountsInApp.wabaId,
      })
      .from(whatsappAccountsInApp)
      .innerJoin(
        providerCredentialsInApp,
        and(
          eq(providerCredentialsInApp.tenantId, whatsappAccountsInApp.tenantId),
          eq(providerCredentialsInApp.whatsappAccountId, whatsappAccountsInApp.id),
        ),
      )
      .where(
        and(eq(whatsappAccountsInApp.tenantId, tenantId), eq(whatsappAccountsInApp.id, accountId)),
      )
      .limit(1);
    return rows[0];
  }

  async create(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    approvalStatus: "DRAFT" | "NOT_REQUIRED",
    input: TemplateContentInput & { readonly whatsappAccountId: string },
  ) {
    const rows = await transaction
      .insert(templatesInApp)
      .values({
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        name: input.name,
        language: input.language,
        category: input.category,
        components: input.components,
        providerStatus: "DRAFT",
        approvalStatus,
      })
      .returning(templateProjection());
    return rows[0];
  }

  async updateMaterial(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    templateId: string,
    approvalStatus: "DRAFT" | "NOT_REQUIRED",
    input: TemplateContentInput & { readonly expectedContentVersion: number },
  ) {
    const rows = await transaction
      .update(templatesInApp)
      .set({
        category: input.category,
        components: input.components,
        language: input.language,
        name: input.name,
        contentVersion: input.expectedContentVersion + 1,
        approvalStatus,
        approvalRequestedBy: null,
        approvalRequestedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        approvedVersion: null,
        approvalRejectionReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.id, templateId),
          eq(templatesInApp.contentVersion, input.expectedContentVersion),
          eq(templatesInApp.providerStatus, "DRAFT"),
          isNull(templatesInApp.providerTemplateId),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .returning(templateProjection());
    return rows[0];
  }

  async requestApproval(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    templateId: string,
    actorId: string,
    expectedContentVersion: number,
  ) {
    const rows = await transaction
      .update(templatesInApp)
      .set({
        approvalStatus: "PENDING",
        approvalRequestedBy: actorId,
        approvalRequestedAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        approvedVersion: null,
        approvalRejectionReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.id, templateId),
          eq(templatesInApp.contentVersion, expectedContentVersion),
          eq(templatesInApp.approvalStatus, "DRAFT"),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .returning(templateProjection());
    return rows[0];
  }

  async review(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    templateId: string,
    reviewerId: string,
    expectedContentVersion: number,
    decision: {
      readonly approvalRejectionReason: string | null;
      readonly approvalStatus: "APPROVED" | "REJECTED";
    },
  ) {
    const rows = await transaction
      .update(templatesInApp)
      .set({
        approvalStatus: decision.approvalStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
        approvedVersion: decision.approvalStatus === "APPROVED" ? expectedContentVersion : null,
        approvalRejectionReason: decision.approvalRejectionReason,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.id, templateId),
          eq(templatesInApp.contentVersion, expectedContentVersion),
          eq(templatesInApp.approvalStatus, "PENDING"),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .returning(templateProjection());
    return rows[0];
  }

  async syncProviderTemplate(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
    input: {
      readonly category: string;
      readonly components: readonly Readonly<Record<string, unknown>>[];
      readonly language: string;
      readonly lastUpdatedAt: string | null;
      readonly name: string;
      readonly providerTemplateId: string;
      readonly rejectionReason: string | null;
      readonly status: "APPROVED" | "DISABLED" | "PAUSED" | "PENDING" | "REJECTED";
    },
  ) {
    const current = await transaction
      .select(templateProjection())
      .from(templatesInApp)
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.whatsappAccountId, accountId),
          eq(templatesInApp.name, input.name),
          eq(templatesInApp.language, input.language),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .limit(1);
    const existing = current[0];
    if (existing === undefined) {
      const rows = await transaction
        .insert(templatesInApp)
        .values({
          tenantId,
          whatsappAccountId: accountId,
          providerTemplateId: input.providerTemplateId,
          name: input.name,
          language: input.language,
          category: input.category,
          components: input.components,
          providerStatus: input.status,
          rejectionReason: input.rejectionReason,
          providerUpdatedAt: input.lastUpdatedAt,
          approvalStatus: "NOT_REQUIRED",
        })
        .returning(templateProjection());
      return rows[0];
    }
    const contentChanged = JSON.stringify(existing.components) !== JSON.stringify(input.components);
    const rows = await transaction
      .update(templatesInApp)
      .set({
        category: input.category,
        components: input.components,
        providerTemplateId: input.providerTemplateId,
        providerStatus: input.status,
        rejectionReason: input.rejectionReason,
        providerUpdatedAt: input.lastUpdatedAt,
        ...(contentChanged && existing.approvalStatus !== "NOT_REQUIRED"
          ? {
              approvalStatus: "DRAFT" as const,
              approvalRequestedBy: null,
              approvalRequestedAt: null,
              reviewedBy: null,
              reviewedAt: null,
              approvedVersion: null,
              approvalRejectionReason: null,
              contentVersion: existing.contentVersion + 1,
            }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(templatesInApp.tenantId, tenantId), eq(templatesInApp.id, existing.id)))
      .returning(templateProjection());
    return rows[0];
  }

  async audit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly action: string;
      readonly actorId: string;
      readonly entityId: string;
      readonly requestId: string;
      readonly tenantId: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: "TENANT_ADMIN",
      action: input.action,
      entityType: "template",
      entityId: input.entityId,
      result: "SUCCESS",
      metadata: {},
      requestId: input.requestId,
    });
  }
}

function templateProjection() {
  return {
    id: templatesInApp.id,
    whatsappAccountId: templatesInApp.whatsappAccountId,
    providerTemplateId: templatesInApp.providerTemplateId,
    name: templatesInApp.name,
    language: templatesInApp.language,
    category: templatesInApp.category,
    providerStatus: templatesInApp.providerStatus,
    components: templatesInApp.components,
    rejectionReason: templatesInApp.rejectionReason,
    providerUpdatedAt: templatesInApp.providerUpdatedAt,
    contentVersion: templatesInApp.contentVersion,
    approvalStatus: templatesInApp.approvalStatus,
    approvalRequestedBy: templatesInApp.approvalRequestedBy,
    approvalRequestedAt: templatesInApp.approvalRequestedAt,
    reviewedBy: templatesInApp.reviewedBy,
    reviewedAt: templatesInApp.reviewedAt,
    approvedVersion: templatesInApp.approvedVersion,
    approvalRejectionReason: templatesInApp.approvalRejectionReason,
    updatedAt: templatesInApp.updatedAt,
  };
}
