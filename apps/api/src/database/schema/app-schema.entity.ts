/**
 * Typed persistence model for the approved MVP schema.
 *
 * This file is intentionally consolidated because the schema contains circular
 * foreign-key relationships. The canonical human-readable contract remains the
 * one-table-per-file SQL under `database/schema/`.
 */
import {
  pgSchema,
  unique,
  uuid,
  text,
  uniqueIndex,
  foreignKey,
  check,
  char,
  jsonb,
  timestamp,
  boolean,
  index,
  bigint,
  integer,
  inet,
  bigserial,
  numeric,
  primaryKey,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const app = pgSchema("app");

export const permissionsInApp = app.table(
  "permissions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    permissionKey: text("permission_key").notNull(),
    description: text().notNull(),
  },
  (table) => [unique("permissions_permission_key_key").on(table.permissionKey)],
);

export const tenantsInApp = app.table(
  "tenants",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    status: text().notNull(),
    defaultTimezone: text("default_timezone").default("UTC").notNull(),
    defaultCountryCode: char("default_country_code", { length: 2 }),
    businessProfile: jsonb("business_profile").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("tenants_slug_active_uq")
      .using("btree", table.slug.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    check(
      "tenants_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
    check(
      "tenants_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'CLOSED'::text])`,
    ),
  ],
);

export const subscriptionsInApp = app.table(
  "subscriptions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    planId: uuid("plan_id").notNull(),
    status: text().notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }),
    externalCustomerRef: text("external_customer_ref"),
    externalSubscriptionRef: text("external_subscription_ref"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscriptions_tenant_status_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.planId],
      foreignColumns: [plansInApp.id],
      name: "subscriptions_plan_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "subscriptions_tenant_id_fkey",
    }),
    check("subscriptions_period_ck", sql`(ends_at IS NULL) OR (ends_at > starts_at)`),
    check(
      "subscriptions_status_check",
      sql`status = ANY (ARRAY['TRIAL'::text, 'ACTIVE'::text, 'PAST_DUE'::text, 'SUSPENDED'::text, 'CANCELLED'::text, 'EXPIRED'::text])`,
    ),
  ],
);

export const plansInApp = app.table(
  "plans",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    status: text().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    priceMinor: bigint("price_minor", { mode: "number" }).default(0).notNull(),
    currency: char({ length: 3 }),
    validityDays: integer("validity_days"),
    limits: jsonb().default({}).notNull(),
    featureFlags: jsonb("feature_flags").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("plans_code_key").on(table.code),
    check("plans_price_minor_check", sql`price_minor >= 0`),
    check(
      "plans_status_check",
      sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'RETIRED'::text])`,
    ),
    check("plans_validity_days_check", sql`(validity_days IS NULL) OR (validity_days > 0)`),
  ],
);

export const rolesInApp = app.table(
  "roles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id"),
    name: text().notNull(),
    systemKey: text("system_key"),
    isSystem: boolean("is_system").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("roles_platform_name_active_uq")
      .using("btree", table.name.asc().nullsLast())
      .where(sql`((tenant_id IS NULL) AND (is_deleted = false))`),
    uniqueIndex("roles_platform_system_key_active_uq")
      .using("btree", table.systemKey.asc().nullsLast())
      .where(sql`((tenant_id IS NULL) AND (system_key IS NOT NULL) AND (is_deleted = false))`),
    uniqueIndex("roles_tenant_name_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.name.asc().nullsLast())
      .where(sql`((tenant_id IS NOT NULL) AND (is_deleted = false))`),
    uniqueIndex("roles_tenant_system_key_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.systemKey.asc().nullsLast())
      .where(sql`((tenant_id IS NOT NULL) AND (system_key IS NOT NULL) AND (is_deleted = false))`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "roles_tenant_id_fkey",
    }),
    check(
      "roles_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const usersInApp = app.table(
  "users",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    homeTenantId: uuid("home_tenant_id"),
    roleId: uuid("role_id").notNull(),
    email: text().notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    displayName: text("display_name").notNull(),
    status: text().notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    tokenVersion: integer("token_version").default(1).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("users_email_active_uq")
      .using("btree", sql`lower(email)`)
      .where(sql`(is_deleted = false)`),
    index("users_home_tenant_active_idx")
      .using("btree", table.homeTenantId.asc().nullsLast(), table.status.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [table.id],
      name: "users_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.homeTenantId],
      foreignColumns: [tenantsInApp.id],
      name: "users_home_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInApp.id],
      name: "users_role_id_fkey",
    }),
    check(
      "users_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
    check(
      "users_status_check",
      sql`status = ANY (ARRAY['INVITED'::text, 'ACTIVE'::text, 'LOCKED'::text, 'DISABLED'::text])`,
    ),
  ],
);

/**
 * Append-only manual payment ledger. A future payment adapter will translate gateway
 * transactions into these business records without persisting provider payloads.
 */
export const paymentRecordsInApp = app.table(
  "payment_records",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    recordedBy: uuid("recorded_by").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char({ length: 3 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }).notNull(),
    reference: text().notNull(),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payment_records_tenant_paid_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.paidAt.desc().nullsLast(),
    ),
    unique("payment_records_tenant_reference_key").on(table.tenantId, table.reference),
    foreignKey({
      columns: [table.recordedBy],
      foreignColumns: [usersInApp.id],
      name: "payment_records_recorded_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "payment_records_tenant_id_fkey",
    }),
    check("payment_records_amount_minor_check", sql`amount_minor > 0`),
    check("payment_records_currency_check", sql`currency ~ '^[A-Z]{3}$'`),
  ],
);

export const userTenantScopesInApp = app.table(
  "user_tenant_scopes",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    roleId: uuid("role_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    index("user_tenant_scopes_tenant_active_idx")
      .using("btree", table.tenantId.asc().nullsLast(), table.userId.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    uniqueIndex("user_tenant_scopes_user_active_uq")
      .using("btree", table.userId.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "user_tenant_scopes_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInApp.id],
      name: "user_tenant_scopes_role_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "user_tenant_scopes_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInApp.id],
      name: "user_tenant_scopes_user_id_fkey",
    }),
    check(
      "user_tenant_scopes_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const authSessionsInApp = app.table(
  "auth_sessions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    tokenFamilyId: uuid("token_family_id").notNull(),
    replacedBySessionId: uuid("replaced_by_session_id"),
    userAgent: text("user_agent"),
    ipAddress: inet("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_sessions_user_active_idx")
      .using("btree", table.userId.asc().nullsLast(), table.expiresAt.asc().nullsLast())
      .where(sql`(revoked_at IS NULL)`),
    foreignKey({
      columns: [table.replacedBySessionId],
      foreignColumns: [table.id],
      name: "auth_sessions_replaced_by_session_id_fkey",
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInApp.id],
      name: "auth_sessions_user_id_fkey",
    }),
    unique("auth_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
  ],
);

export const whatsappAccountsInApp = app.table(
  "whatsapp_accounts",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    provider: text().default("META").notNull(),
    businessId: text("business_id"),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhone: text("display_phone").notNull(),
    displayName: text("display_name"),
    status: text().notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    health: jsonb().default({}).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("whatsapp_accounts_one_default_uq")
      .using("btree", table.tenantId.asc().nullsLast())
      .where(sql`(is_default = true)`),
    index("whatsapp_accounts_tenant_status_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "whatsapp_accounts_tenant_id_fkey",
    }),
    unique("whatsapp_accounts_tenant_id_id_key").on(table.tenantId, table.id),
    unique("whatsapp_accounts_provider_phone_number_id_key").on(
      table.provider,
      table.phoneNumberId,
    ),
    check(
      "whatsapp_accounts_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'CONNECTED'::text, 'DEGRADED'::text, 'AUTH_FAILED'::text, 'DISCONNECTED'::text])`,
    ),
  ],
);

export const providerCredentialsInApp = app.table(
  "provider_credentials",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id").notNull(),
    provider: text().notNull(),
    secretRef: text("secret_ref").notNull(),
    encryptedToken: text("encrypted_token"),
    status: text().notNull(),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.tenantId, whatsappAccountsInApp.id],
      name: "provider_credentials_tenant_account_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "provider_credentials_tenant_id_fkey",
    }),
    unique("provider_credentials_whatsapp_account_id_key").on(table.whatsappAccountId),
    check(
      "provider_credentials_storage_check",
      sql`(encrypted_token IS NULL AND secret_ref NOT LIKE 'encrypted://%') OR (encrypted_token IS NOT NULL AND secret_ref = 'encrypted://' || id::text)`,
    ),
    check(
      "provider_credentials_status_check",
      sql`status = ANY (ARRAY['ACTIVE'::text, 'INVALID'::text, 'REVOKED'::text])`,
    ),
  ],
);

export const contactsInApp = app.table(
  "contacts",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    phoneE164: text("phone_e164").notNull(),
    name: text(),
    email: text(),
    company: text(),
    address: text(),
    source: text(),
    assignedUserId: uuid("assigned_user_id"),
    customFields: jsonb("custom_fields").default({}).notNull(),
    consentStatus: text("consent_status").default("UNKNOWN").notNull(),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "string" }),
    consentCategory: text("consent_category"),
    consentProofReference: text("consent_proof_reference"),
    optOutAt: timestamp("opt_out_at", { withTimezone: true, mode: "string" }),
    optOutSource: text("opt_out_source"),
    suppressionReason: text("suppression_reason"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    index("contacts_tenant_created_active_idx")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.createdAt.desc().nullsLast(),
        table.id.desc().nullsLast(),
      )
      .where(sql`(is_deleted = false)`),
    index("contacts_tenant_consent_active_idx")
      .using("btree", table.tenantId.asc().nullsLast(), table.consentStatus.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    index("contacts_tenant_name_active_idx")
      .using("btree", table.tenantId.asc().nullsLast(), table.name.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    uniqueIndex("contacts_tenant_phone_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.phoneE164.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.assignedUserId],
      foreignColumns: [usersInApp.id],
      name: "contacts_assigned_user_id_fkey",
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "contacts_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "contacts_tenant_id_fkey",
    }),
    unique("contacts_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "contacts_consent_status_check",
      sql`consent_status = ANY (ARRAY['UNKNOWN'::text, 'OPTED_IN'::text, 'OPTED_OUT'::text, 'SUPPRESSED'::text])`,
    ),
    check(
      "contacts_opted_in_evidence_ck",
      sql`(consent_status <> 'OPTED_IN') OR ((consent_source IS NOT NULL) AND (consent_at IS NOT NULL) AND (consent_proof_reference IS NOT NULL))`,
    ),
    check(
      "contacts_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const contactImportsInApp = app.table(
  "contact_imports",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    status: text().notNull(),
    mapping: jsonb().default({}).notNull(),
    defaultCountryCode: char("default_country_code", { length: 2 }),
    totalRows: integer("total_rows").default(0).notNull(),
    insertedRows: integer("inserted_rows").default(0).notNull(),
    updatedRows: integer("updated_rows").default(0).notNull(),
    invalidRows: integer("invalid_rows").default(0).notNull(),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    storageDeletedAt: timestamp("storage_deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("contact_imports_tenant_created_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.requestedBy],
      foreignColumns: [usersInApp.id],
      name: "contact_imports_requested_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "contact_imports_tenant_id_fkey",
    }),
    unique("contact_imports_tenant_id_id_key").on(table.tenantId, table.id),
    check("contact_imports_inserted_rows_check", sql`inserted_rows >= 0`),
    check("contact_imports_invalid_rows_check", sql`invalid_rows >= 0`),
    check(
      "contact_imports_status_check",
      sql`status = ANY (ARRAY['UPLOADED'::text, 'QUEUED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])`,
    ),
    check("contact_imports_total_rows_check", sql`total_rows >= 0`),
    check("contact_imports_updated_rows_check", sql`updated_rows >= 0`),
  ],
);

export const contactGroupsInApp = app.table(
  "contact_groups",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    name: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("contact_groups_tenant_name_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.name.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "contact_groups_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "contact_groups_tenant_id_fkey",
    }),
    unique("contact_groups_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "contact_groups_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const contactGroupMembersInApp = app.table(
  "contact_group_members",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    groupId: uuid("group_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("contact_group_members_active_uq")
      .using("btree", table.groupId.asc().nullsLast(), table.contactId.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    index("contact_group_members_contact_active_idx")
      .using("btree", table.tenantId.asc().nullsLast(), table.contactId.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "contact_group_members_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contactsInApp.tenantId, contactsInApp.id],
      name: "contact_group_members_tenant_contact_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.groupId],
      foreignColumns: [contactGroupsInApp.tenantId, contactGroupsInApp.id],
      name: "contact_group_members_tenant_group_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "contact_group_members_tenant_id_fkey",
    }),
    check(
      "contact_group_members_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const contactImportErrorsInApp = app.table(
  "contact_import_errors",
  {
    id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
    importId: uuid("import_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    errorCode: text("error_code").notNull(),
    errorMessage: text("error_message").notNull(),
    rowData: jsonb("row_data"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("contact_import_errors_import_row_idx").using(
      "btree",
      table.importId.asc().nullsLast(),
      table.rowNumber.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.importId],
      foreignColumns: [contactImportsInApp.id],
      name: "contact_import_errors_import_id_fkey",
    }),
    unique("contact_import_errors_import_row_code_key").on(
      table.importId,
      table.rowNumber,
      table.errorCode,
    ),
    check("contact_import_errors_row_number_check", sql`row_number > 0`),
  ],
);

export const templatesInApp = app.table(
  "templates",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id").notNull(),
    providerTemplateId: text("provider_template_id"),
    name: text().notNull(),
    language: text().notNull(),
    category: text().notNull(),
    providerStatus: text("provider_status").notNull(),
    components: jsonb().default([]).notNull(),
    rejectionReason: text("rejection_reason"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "string" }),
    contentVersion: integer("content_version").default(1).notNull(),
    approvalStatus: text("approval_status").default("DRAFT").notNull(),
    approvalRequestedBy: uuid("approval_requested_by"),
    approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true, mode: "string" }),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    approvedVersion: integer("approved_version"),
    approvalRejectionReason: text("approval_rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("templates_identity_active_uq")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.whatsappAccountId.asc().nullsLast(),
        table.name.asc().nullsLast(),
        table.language.asc().nullsLast(),
      )
      .where(sql`(is_deleted = false)`),
    index("templates_tenant_approval_active_idx")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.approvalStatus.asc().nullsLast(),
        table.updatedAt.asc().nullsLast(),
      )
      .where(sql`(is_deleted = false)`),
    index("templates_tenant_status_active_idx")
      .using("btree", table.tenantId.asc().nullsLast(), table.providerStatus.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.approvalRequestedBy],
      foreignColumns: [usersInApp.id],
      name: "templates_approval_requested_by_fkey",
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "templates_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [usersInApp.id],
      name: "templates_reviewed_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.tenantId, whatsappAccountsInApp.id],
      name: "templates_tenant_account_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "templates_tenant_id_fkey",
    }),
    unique("templates_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "templates_approval_state_ck",
      sql`((approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text])) AND (approval_requested_by IS NULL) AND (approval_requested_at IS NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'PENDING'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'APPROVED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version = content_version) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'REJECTED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version IS NULL) AND (NULLIF(btrim(approval_rejection_reason), ''::text) IS NOT NULL))`,
    ),
    check(
      "templates_approval_status_check",
      sql`approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])`,
    ),
    check("templates_approved_version_check", sql`approved_version > 0`),
    check("templates_content_version_check", sql`content_version > 0`),
    check(
      "templates_provider_status_check",
      sql`provider_status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'PAUSED'::text, 'DISABLED'::text])`,
    ),
    check(
      "templates_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const conversationsInApp = app.table(
  "conversations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    assignedUserId: uuid("assigned_user_id"),
    status: text().notNull(),
    automationState: text("automation_state").default("NONE").notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    lastCustomerMessageAt: timestamp("last_customer_message_at", {
      withTimezone: true,
      mode: "string",
    }),
    windowExpiresAt: timestamp("window_expires_at", { withTimezone: true, mode: "string" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversations_assignee_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.assignedUserId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("conversations_inbox_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.status.asc().nullsLast(),
      table.lastMessageAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.assignedUserId],
      foreignColumns: [usersInApp.id],
      name: "conversations_assigned_user_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.tenantId, whatsappAccountsInApp.id],
      name: "conversations_tenant_account_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contactsInApp.tenantId, contactsInApp.id],
      name: "conversations_tenant_contact_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "conversations_tenant_id_fkey",
    }),
    unique("conversations_tenant_id_id_key").on(table.tenantId, table.id),
    unique("conversations_tenant_id_whatsapp_account_id_contact_id_key").on(
      table.tenantId,
      table.whatsappAccountId,
      table.contactId,
    ),
    check(
      "conversations_automation_state_check",
      sql`automation_state = ANY (ARRAY['NONE'::text, 'ACTIVE'::text, 'PAUSED'::text, 'HANDED_OFF'::text])`,
    ),
    check(
      "conversations_status_check",
      sql`status = ANY (ARRAY['OPEN'::text, 'PENDING'::text, 'CLOSED'::text, 'ARCHIVED'::text])`,
    ),
    check("conversations_unread_count_check", sql`unread_count >= 0`),
  ],
);

export const campaignsInApp = app.table(
  "campaigns",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id").notNull(),
    templateId: uuid("template_id").notNull(),
    name: text().notNull(),
    description: text(),
    status: text().notNull(),
    audienceDefinition: jsonb("audience_definition").default({}).notNull(),
    variableMapping: jsonb("variable_mapping").default({}).notNull(),
    scheduleAt: timestamp("schedule_at", { withTimezone: true, mode: "string" }),
    scheduleTimezone: text("schedule_timezone").default("UTC").notNull(),
    templateContentVersion: integer("template_content_version"),
    startKey: text("start_key"),
    startHash: text("start_hash"),
    deliveryRequestedBy: uuid("delivery_requested_by"),
    finalPreflightId: uuid("final_preflight_id"),
    pauseReason: text("pause_reason"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    contentVersion: integer("content_version").default(1).notNull(),
    approvalStatus: text("approval_status").default("DRAFT").notNull(),
    approvalRequestedBy: uuid("approval_requested_by"),
    approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true, mode: "string" }),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
    approvedVersion: integer("approved_version"),
    approvalRejectionReason: text("approval_rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table): PgTableExtraConfigValue[] => [
    index("campaigns_tenant_approval_active_idx")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.approvalStatus.asc().nullsLast(),
        table.updatedAt.asc().nullsLast(),
      )
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deliveryRequestedBy],
      foreignColumns: [usersInApp.id],
      name: "campaigns_delivery_requested_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.finalPreflightId],
      foreignColumns: [campaignPreflightRunsInApp.tenantId, campaignPreflightRunsInApp.id],
      name: "campaigns_tenant_final_preflight_fk",
    }),
    check("campaigns_template_content_version_check", sql`template_content_version > 0`),
    index("campaigns_tenant_status_schedule_active_idx")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.status.asc().nullsLast(),
        table.scheduleAt.asc().nullsLast(),
      )
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.approvalRequestedBy],
      foreignColumns: [usersInApp.id],
      name: "campaigns_approval_requested_by_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInApp.id],
      name: "campaigns_created_by_fkey",
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "campaigns_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [usersInApp.id],
      name: "campaigns_reviewed_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.tenantId, whatsappAccountsInApp.id],
      name: "campaigns_tenant_account_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "campaigns_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.templateId],
      foreignColumns: [templatesInApp.tenantId, templatesInApp.id],
      name: "campaigns_tenant_template_fk",
    }),
    unique("campaigns_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "campaigns_approval_state_ck",
      sql`((approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text])) AND (approval_requested_by IS NULL) AND (approval_requested_at IS NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'PENDING'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'APPROVED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version = content_version) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'REJECTED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version IS NULL) AND (NULLIF(btrim(approval_rejection_reason), ''::text) IS NOT NULL))`,
    ),
    check(
      "campaigns_approval_status_check",
      sql`approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])`,
    ),
    check("campaigns_approved_version_check", sql`approved_version > 0`),
    check("campaigns_content_version_check", sql`content_version > 0`),
    check(
      "campaigns_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
    check(
      "campaigns_status_check",
      sql`status = ANY (ARRAY['DRAFT'::text, 'SCHEDULED'::text, 'QUEUED'::text, 'RUNNING'::text, 'PAUSED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'FAILED'::text])`,
    ),
  ],
);

export const messagesInApp = app.table(
  "messages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    campaignId: uuid("campaign_id"),
    contactId: uuid("contact_id").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id").notNull(),
    direction: text().notNull(),
    messageType: text("message_type").notNull(),
    status: text().notNull(),
    providerMessageId: text("provider_message_id"),
    clientMessageKey: text("client_message_key"),
    content: jsonb().default({}).notNull(),
    policyDecision: jsonb("policy_decision").default({}).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true, mode: "string" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "string" }),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_campaign_status_idx")
      .using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.campaignId.asc().nullsLast(),
        table.status.asc().nullsLast(),
      )
      .where(sql`(campaign_id IS NOT NULL)`),
    uniqueIndex("messages_client_key_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.clientMessageKey.asc().nullsLast())
      .where(sql`(client_message_key IS NOT NULL)`),
    index("messages_conversation_created_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.conversationId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("messages_pending_send_idx")
      .using("btree", table.status.asc().nullsLast(), table.createdAt.asc().nullsLast())
      .where(sql`(status = ANY (ARRAY['CREATED'::text, 'QUEUED'::text, 'SENDING'::text]))`),
    foreignKey({
      columns: [table.tenantId, table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.tenantId, whatsappAccountsInApp.id],
      name: "messages_tenant_account_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.campaignId],
      foreignColumns: [campaignsInApp.tenantId, campaignsInApp.id],
      name: "messages_tenant_campaign_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contactsInApp.tenantId, contactsInApp.id],
      name: "messages_tenant_contact_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversationsInApp.tenantId, conversationsInApp.id],
      name: "messages_tenant_conversation_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "messages_tenant_id_fkey",
    }),
    unique("messages_tenant_id_id_key").on(table.tenantId, table.id),
    unique("messages_provider_message_id_key").on(table.providerMessageId),
    check(
      "messages_direction_check",
      sql`direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text])`,
    ),
    check(
      "messages_message_type_check",
      sql`message_type = ANY (ARRAY['TEXT'::text, 'TEMPLATE'::text, 'IMAGE'::text, 'VIDEO'::text, 'DOCUMENT'::text, 'AUDIO'::text, 'INTERACTIVE'::text, 'SYSTEM'::text])`,
    ),
    check(
      "messages_status_check",
      sql`status = ANY (ARRAY['RECEIVED'::text, 'CREATED'::text, 'QUEUED'::text, 'SENDING'::text, 'SENT'::text, 'DELIVERED'::text, 'READ'::text, 'FAILED'::text, 'CANCELLED'::text])`,
    ),
  ],
);

export const conversationNotesInApp = app.table(
  "conversation_notes",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    authorId: uuid("author_id").notNull(),
    note: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversation_notes_thread_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.conversationId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [usersInApp.id],
      name: "conversation_notes_author_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversationsInApp.tenantId, conversationsInApp.id],
      name: "conversation_notes_tenant_conversation_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "conversation_notes_tenant_id_fkey",
    }),
    unique("conversation_notes_tenant_id_id_key").on(table.tenantId, table.id),
  ],
);

export const campaignPreflightRunsInApp = app.table(
  "campaign_preflight_runs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    contentVersion: integer("content_version").notNull(),
    status: text().notNull(),
    blockers: jsonb().default([]).notNull(),
    estimates: jsonb().default({}).notNull(),
    errorCode: text("error_code"),
    requestedBy: uuid("requested_by").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("campaign_preflight_runs_one_active_idx")
      .on(table.campaignId)
      .where(sql`status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text])`),
    index("campaign_preflight_runs_tenant_campaign_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.campaignId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.tenantId, table.campaignId],
      foreignColumns: [campaignsInApp.tenantId, campaignsInApp.id],
      name: "campaign_preflight_runs_tenant_campaign_fk",
    }),
    foreignKey({
      columns: [table.requestedBy],
      foreignColumns: [usersInApp.id],
      name: "campaign_preflight_runs_requested_by_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "campaign_preflight_runs_tenant_id_fkey",
    }),
    unique("campaign_preflight_runs_tenant_id_id_key").on(table.tenantId, table.id),
    check("campaign_preflight_runs_content_version_check", sql`content_version > 0`),
    check(
      "campaign_preflight_runs_status_check",
      sql`status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'SUPERSEDED'::text])`,
    ),
  ],
);

export const campaignRecipientsInApp = app.table(
  "campaign_recipients",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    preflightRunId: uuid("preflight_run_id"),
    contentVersion: integer("content_version").default(1).notNull(),
    contactId: uuid("contact_id").notNull(),
    messageId: uuid("message_id"),
    status: text().notNull(),
    renderedVariables: jsonb("rendered_variables").default({}).notNull(),
    skipOrErrorCode: text("skip_or_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campaign_recipients_report_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.campaignId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tenantId, table.campaignId],
      foreignColumns: [campaignsInApp.tenantId, campaignsInApp.id],
      name: "campaign_recipients_tenant_campaign_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contactsInApp.tenantId, contactsInApp.id],
      name: "campaign_recipients_tenant_contact_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.preflightRunId],
      foreignColumns: [campaignPreflightRunsInApp.tenantId, campaignPreflightRunsInApp.id],
      name: "campaign_recipients_tenant_preflight_run_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "campaign_recipients_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.messageId],
      foreignColumns: [messagesInApp.tenantId, messagesInApp.id],
      name: "campaign_recipients_tenant_message_fk",
    }),
    unique("campaign_recipients_tenant_id_id_key").on(table.tenantId, table.id),
    unique("campaign_recipients_campaign_id_contact_id_key").on(table.campaignId, table.contactId),
    check("campaign_recipients_content_version_check", sql`content_version > 0`),
    check(
      "campaign_recipients_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'SKIPPED'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'READ'::text, 'FAILED'::text, 'CANCELLED'::text])`,
    ),
  ],
);

export const automationFlowsInApp = app.table(
  "automation_flows",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    name: text().notNull(),
    status: text().notNull(),
    publishedVersionId: uuid("published_version_id"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("automation_flows_tenant_name_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.name.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInApp.id],
      name: "automation_flows_created_by_fkey",
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "automation_flows_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "automation_flows_tenant_id_fkey",
    }),
    unique("automation_flows_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "automation_flows_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
    check(
      "automation_flows_status_check",
      sql`status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'PAUSED'::text, 'RETIRED'::text])`,
    ),
  ],
);

export const automationVersionsInApp = app.table(
  "automation_versions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    flowId: uuid("flow_id").notNull(),
    versionNo: integer("version_no").notNull(),
    status: text().notNull(),
    triggerConfig: jsonb("trigger_config").default({}).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.flowId],
      foreignColumns: [automationFlowsInApp.tenantId, automationFlowsInApp.id],
      name: "automation_versions_tenant_flow_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "automation_versions_tenant_id_fkey",
    }),
    unique("automation_versions_tenant_id_id_key").on(table.tenantId, table.id),
    unique("automation_versions_flow_id_version_no_key").on(table.flowId, table.versionNo),
    check(
      "automation_versions_status_check",
      sql`status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'RETIRED'::text])`,
    ),
    check("automation_versions_version_no_check", sql`version_no > 0`),
  ],
);

export const automationNodesInApp = app.table(
  "automation_nodes",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    versionId: uuid("version_id").notNull(),
    nodeKey: text("node_key").notNull(),
    nodeType: text("node_type").notNull(),
    config: jsonb().default({}).notNull(),
    position: jsonb().default({}).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "automation_nodes_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.versionId],
      foreignColumns: [automationVersionsInApp.tenantId, automationVersionsInApp.id],
      name: "automation_nodes_tenant_version_fk",
    }),
    unique("automation_nodes_tenant_id_id_key").on(table.tenantId, table.id),
    unique("automation_nodes_version_id_node_key_key").on(table.versionId, table.nodeKey),
    check(
      "automation_nodes_node_type_check",
      sql`node_type = ANY (ARRAY['START'::text, 'MESSAGE'::text, 'BUTTONS'::text, 'LIST'::text, 'ASSIGN'::text, 'CONTACT_UPDATE'::text, 'HUMAN_HANDOFF'::text, 'END'::text])`,
    ),
  ],
);

export const mediaAssetsInApp = app.table(
  "media_assets",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    scanStatus: text("scan_status").notNull(),
    providerMediaId: text("provider_media_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
  },
  (table) => [
    uniqueIndex("media_assets_storage_key_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.storageKey.asc().nullsLast())
      .where(sql`(is_deleted = false)`),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [usersInApp.id],
      name: "media_assets_deleted_by_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "media_assets_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [usersInApp.id],
      name: "media_assets_uploaded_by_fkey",
    }),
    unique("media_assets_tenant_id_id_key").on(table.tenantId, table.id),
    check(
      "media_assets_scan_status_check",
      sql`scan_status = ANY (ARRAY['PENDING'::text, 'CLEAN'::text, 'INFECTED'::text, 'FAILED'::text])`,
    ),
    check("media_assets_size_bytes_check", sql`size_bytes >= 0`),
    check(
      "media_assets_soft_delete_ck",
      sql`((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))`,
    ),
  ],
);

export const automationEdgesInApp = app.table(
  "automation_edges",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    versionId: uuid("version_id").notNull(),
    fromNodeId: uuid("from_node_id").notNull(),
    toNodeId: uuid("to_node_id").notNull(),
    condition: jsonb().default({}).notNull(),
    priority: integer().default(0).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.fromNodeId],
      foreignColumns: [automationNodesInApp.tenantId, automationNodesInApp.id],
      name: "automation_edges_tenant_from_node_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "automation_edges_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.toNodeId],
      foreignColumns: [automationNodesInApp.tenantId, automationNodesInApp.id],
      name: "automation_edges_tenant_to_node_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.versionId],
      foreignColumns: [automationVersionsInApp.tenantId, automationVersionsInApp.id],
      name: "automation_edges_tenant_version_fk",
    }),
    unique("automation_edges_version_id_from_node_id_to_node_id_priorit_key").on(
      table.versionId,
      table.fromNodeId,
      table.toNodeId,
      table.priority,
    ),
  ],
);

export const automationRunsInApp = app.table(
  "automation_runs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    currentNodeId: uuid("current_node_id"),
    status: text().notNull(),
    state: jsonb().default({}).notNull(),
    lastEventKey: text("last_event_key"),
    lockVersion: integer("lock_version").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("automation_runs_one_active_uq")
      .using("btree", table.tenantId.asc().nullsLast(), table.conversationId.asc().nullsLast())
      .where(
        sql`(status = ANY (ARRAY['RUNNING'::text, 'WAITING'::text, 'PAUSED'::text, 'HANDED_OFF'::text]))`,
      ),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversationsInApp.tenantId, conversationsInApp.id],
      name: "automation_runs_tenant_conversation_fk",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "automation_runs_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId, table.currentNodeId],
      foreignColumns: [automationNodesInApp.tenantId, automationNodesInApp.id],
      name: "automation_runs_tenant_node_fk",
    }),
    foreignKey({
      columns: [table.tenantId, table.flowVersionId],
      foreignColumns: [automationVersionsInApp.tenantId, automationVersionsInApp.id],
      name: "automation_runs_tenant_version_fk",
    }),
    unique("automation_runs_tenant_id_id_key").on(table.tenantId, table.id),
    check("automation_runs_lock_version_check", sql`lock_version >= 0`),
    check(
      "automation_runs_status_check",
      sql`status = ANY (ARRAY['RUNNING'::text, 'WAITING'::text, 'PAUSED'::text, 'HANDED_OFF'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])`,
    ),
  ],
);

export const webhookEventsInApp = app.table(
  "webhook_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().notNull(),
    externalEventKey: text("external_event_key").notNull(),
    eventType: text("event_type").notNull(),
    whatsappAccountId: uuid("whatsapp_account_id"),
    tenantId: uuid("tenant_id"),
    payload: jsonb(),
    payloadRef: text("payload_ref"),
    status: text().notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastErrorCode: text("last_error_code"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true, mode: "string" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("webhook_events_pending_idx")
      .using("btree", table.status.asc().nullsLast(), table.receivedAt.asc().nullsLast())
      .where(sql`(status = ANY (ARRAY['RECEIVED'::text, 'QUEUED'::text, 'FAILED'::text]))`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "webhook_events_tenant_id_fkey",
    }),
    foreignKey({
      columns: [table.whatsappAccountId],
      foreignColumns: [whatsappAccountsInApp.id],
      name: "webhook_events_whatsapp_account_id_fkey",
    }),
    unique("webhook_events_provider_external_event_key_key").on(
      table.provider,
      table.externalEventKey,
    ),
    check("webhook_events_attempt_count_check", sql`attempt_count >= 0`),
    check(
      "webhook_events_status_check",
      sql`status = ANY (ARRAY['RECEIVED'::text, 'QUEUED'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'FAILED'::text, 'DEAD'::text])`,
    ),
  ],
);

export const usageEventsInApp = app.table(
  "usage_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id").notNull(),
    eventType: text("event_type").notNull(),
    quantity: numeric({ precision: 20, scale: 6 }).notNull(),
    unit: text().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    providerReference: text("provider_reference"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("usage_events_period_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.occurredAt.asc().nullsLast(),
      table.eventType.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "usage_events_tenant_id_fkey",
    }),
    unique("usage_events_tenant_id_dedupe_key_key").on(table.tenantId, table.dedupeKey),
    check("usage_events_quantity_check", sql`quantity >= (0)::numeric`),
  ],
);

export const auditLogsInApp = app.table(
  "audit_logs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id"),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    result: text().notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    metadata: jsonb().default({}).notNull(),
    requestId: text("request_id").notNull(),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.entityType.asc().nullsLast(),
      table.entityId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("audit_logs_tenant_created_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [usersInApp.id],
      name: "audit_logs_actor_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "audit_logs_tenant_id_fkey",
    }),
    check(
      "audit_logs_result_check",
      sql`result = ANY (ARRAY['SUCCESS'::text, 'DENIED'::text, 'FAILED'::text])`,
    ),
  ],
);

export const idempotencyKeysInApp = app.table(
  "idempotency_keys",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id"),
    actorId: uuid("actor_id"),
    httpMethod: text("http_method").notNull(),
    routeKey: text("route_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    state: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idempotency_keys_expiry_idx").using("btree", table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [usersInApp.id],
      name: "idempotency_keys_actor_id_fkey",
    }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "idempotency_keys_tenant_id_fkey",
    }),
    unique("idempotency_keys_tenant_id_actor_id_http_method_route_key_i_key")
      .on(table.tenantId, table.actorId, table.httpMethod, table.routeKey, table.idempotencyKey)
      .nullsNotDistinct(),
    check(
      "idempotency_keys_response_status_check",
      sql`(response_status IS NULL) OR ((response_status >= 100) AND (response_status <= 599))`,
    ),
    check(
      "idempotency_keys_state_check",
      sql`state = ANY (ARRAY['PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text])`,
    ),
  ],
);

export const outboxEventsInApp = app.table(
  "outbox_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tenantId: uuid("tenant_id"),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb().notNull(),
    correlationId: text("correlation_id").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    status: text().default("PENDING").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "string" }),
    lockedBy: text("locked_by"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("outbox_events_relay_idx")
      .using(
        "btree",
        table.status.asc().nullsLast(),
        table.availableAt.asc().nullsLast(),
        table.createdAt.asc().nullsLast(),
      )
      .where(sql`(status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]))`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenantsInApp.id],
      name: "outbox_events_tenant_id_fkey",
    }),
    check("outbox_events_attempt_count_check", sql`attempt_count >= 0`),
    check("outbox_events_schema_version_check", sql`schema_version > 0`),
    check(
      "outbox_events_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'PUBLISHED'::text, 'FAILED'::text])`,
    ),
  ],
);

export const rolePermissionsInApp = app.table(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissionsInApp.id],
      name: "role_permissions_permission_id_fkey",
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInApp.id],
      name: "role_permissions_role_id_fkey",
    }),
    primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pkey" }),
  ],
);
