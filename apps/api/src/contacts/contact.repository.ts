import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  contactGroupMembersInApp,
  contactsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../database/schema/index.js";
import type {
  ContactCursor,
  CreateContactInput,
  UpdateContactConsentInput,
  UpdateContactInput,
} from "./contact.dto.js";

@Injectable()
export class ContactRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  /** Minimal options projection matching isActiveTenantAssignee; never expose login identifiers. */
  async listActiveTenantAssignees(
    tenantId: string,
    page: { limit: number; cursor: { at: string; id: string } | null },
  ) {
    const result = await this.database.execute<{ id: string; displayName: string; at: string }>(sql`
      SELECT u.id,u.display_name AS "displayName",u.created_at::text AS at FROM app.users u
      JOIN app.user_tenant_scopes s ON s.user_id=u.id AND s.tenant_id=${tenantId}::uuid AND s.is_deleted=false
      JOIN app.roles r ON r.id=u.role_id AND r.is_deleted=false
      WHERE u.home_tenant_id=${tenantId}::uuid AND u.status='ACTIVE' AND u.is_deleted=false
        AND r.system_key IN ('TENANT_ADMIN','TENANT_USER')
      ${page.cursor === null ? sql`` : sql`AND (u.created_at,u.id) < (${page.cursor.at}::timestamptz,${page.cursor.id}::uuid)`}
      ORDER BY u.created_at DESC,u.id DESC LIMIT ${page.limit + 1}
    `);
    return result.rows;
  }

  async list(
    tenantId: string,
    input: { readonly cursor: ContactCursor | null; readonly limit: number },
  ) {
    const where =
      input.cursor === null
        ? and(eq(contactsInApp.tenantId, tenantId), eq(contactsInApp.isDeleted, false))
        : and(
            eq(contactsInApp.tenantId, tenantId),
            eq(contactsInApp.isDeleted, false),
            or(
              lt(contactsInApp.createdAt, input.cursor.createdAt),
              and(
                eq(contactsInApp.createdAt, input.cursor.createdAt),
                lt(contactsInApp.id, input.cursor.id),
              ),
            ),
          );
    return this.database
      .select(contactProjection())
      .from(contactsInApp)
      .where(where)
      .orderBy(desc(contactsInApp.createdAt), desc(contactsInApp.id))
      .limit(input.limit + 1);
  }

  async findActive(tenantId: string, contactId: string) {
    const rows = await this.database
      .select(contactProjection())
      .from(contactsInApp)
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.id, contactId),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async isActiveTenantAssignee(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await transaction
      .select({ id: usersInApp.id })
      .from(usersInApp)
      .innerJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.tenantId, tenantId),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      )
      .innerJoin(
        rolesInApp,
        and(eq(rolesInApp.id, usersInApp.roleId), eq(rolesInApp.isDeleted, false)),
      )
      .where(
        and(
          eq(usersInApp.id, userId),
          eq(usersInApp.homeTenantId, tenantId),
          eq(usersInApp.status, "ACTIVE"),
          eq(usersInApp.isDeleted, false),
          inArray(rolesInApp.systemKey, ["TENANT_ADMIN", "TENANT_USER"]),
        ),
      )
      .limit(1);
    return rows[0] !== undefined;
  }

  async create(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: CreateContactInput & { readonly phoneE164: string },
  ) {
    const rows = await transaction
      .insert(contactsInApp)
      .values({
        address: input.address,
        assignedUserId: input.assignedUserId,
        company: input.company,
        consentStatus: "UNKNOWN",
        customFields: input.customFields,
        email: input.email,
        name: input.name,
        phoneE164: input.phoneE164,
        source: "MANUAL",
        tenantId,
      })
      .returning(contactProjection());
    return rows[0];
  }

  /** Explicit restore lookup; ordinary Contact reads must continue excluding deleted rows. */
  findDeletedByPhoneForUpdate(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    phoneE164: string,
  ) {
    return transaction
      .select({ id: contactsInApp.id })
      .from(contactsInApp)
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.phoneE164, phoneE164),
          eq(contactsInApp.isDeleted, true),
        ),
      )
      .limit(2)
      .for("update");
  }

  async restore(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    contactId: string,
    input: CreateContactInput & { readonly phoneE164: string },
  ) {
    const rows = await transaction
      .update(contactsInApp)
      .set({
        address: input.address,
        assignedUserId: input.assignedUserId,
        company: input.company,
        customFields: input.customFields,
        deletedAt: null,
        deletedBy: null,
        email: input.email,
        isDeleted: false,
        name: input.name,
        phoneE164: input.phoneE164,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.id, contactId),
          eq(contactsInApp.isDeleted, true),
        ),
      )
      .returning(contactProjection());
    return rows[0];
  }

  async update(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    contactId: string,
    input: UpdateContactInput & { readonly phoneE164?: string },
  ) {
    const rows = await transaction
      .update(contactsInApp)
      .set({
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.assignedUserId === undefined ? {} : { assignedUserId: input.assignedUserId }),
        ...(input.company === undefined ? {} : { company: input.company }),
        ...(input.customFields === undefined ? {} : { customFields: input.customFields }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.phoneE164 === undefined ? {} : { phoneE164: input.phoneE164 }),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.id, contactId),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .returning(contactProjection());
    return rows[0];
  }

  async updateConsent(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    contactId: string,
    input: UpdateContactConsentInput,
  ) {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const values =
      input.status === "OPTED_IN"
        ? {
            consentAt: occurredAt,
            consentCategory: input.category,
            consentProofReference: input.proofReference,
            consentSource: input.source,
            consentStatus: "OPTED_IN" as const,
            optOutAt: null,
            optOutSource: null,
            suppressionReason: null,
          }
        : {
            consentStatus: input.status,
            optOutAt: occurredAt,
            optOutSource: input.source,
            suppressionReason: input.status === "SUPPRESSED" ? input.suppressionReason : null,
          };
    const rows = await transaction
      .update(contactsInApp)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.id, contactId),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .returning(contactProjection());
    return rows[0];
  }

  async softDelete(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    contactId: string,
    actorId: string,
  ) {
    const rows = await transaction
      .update(contactsInApp)
      .set({
        deletedAt: new Date().toISOString(),
        deletedBy: actorId,
        isDeleted: true,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.id, contactId),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .returning({ id: contactsInApp.id });
    const contact = rows[0];
    if (contact !== undefined) {
      await transaction
        .update(contactGroupMembersInApp)
        .set({
          deletedAt: new Date().toISOString(),
          deletedBy: actorId,
          isDeleted: true,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(contactGroupMembersInApp.tenantId, tenantId),
            eq(contactGroupMembersInApp.contactId, contactId),
            eq(contactGroupMembersInApp.isDeleted, false),
          ),
        );
    }
    return contact;
  }

  async audit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly action:
        | "CONTACT_CONSENT_UPDATED"
        | "CONTACT_CREATED"
        | "CONTACT_DELETED"
        | "CONTACT_RESTORED"
        | "CONTACT_UPDATED";
      readonly actorId: string;
      readonly actorRole: "TENANT_ADMIN" | "TENANT_USER";
      readonly entityId: string;
      readonly requestId: string;
      readonly tenantId: string;
    },
  ): Promise<void> {
    await transaction.insert(auditLogsInApp).values({
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.entityId,
      entityType: "contact",
      metadata: {},
      requestId: input.requestId,
      result: "SUCCESS",
      tenantId: input.tenantId,
    });
  }
}

function contactProjection() {
  return {
    id: contactsInApp.id,
    phoneE164: contactsInApp.phoneE164,
    name: contactsInApp.name,
    email: contactsInApp.email,
    company: contactsInApp.company,
    address: contactsInApp.address,
    source: contactsInApp.source,
    assignedUserId: contactsInApp.assignedUserId,
    customFields: contactsInApp.customFields,
    consentStatus: contactsInApp.consentStatus,
    consentSource: contactsInApp.consentSource,
    consentAt: contactsInApp.consentAt,
    consentCategory: contactsInApp.consentCategory,
    consentProofReference: contactsInApp.consentProofReference,
    optOutAt: contactsInApp.optOutAt,
    optOutSource: contactsInApp.optOutSource,
    suppressionReason: contactsInApp.suppressionReason,
    lastContactedAt: contactsInApp.lastContactedAt,
    createdAt: contactsInApp.createdAt,
    updatedAt: contactsInApp.updatedAt,
  };
}
