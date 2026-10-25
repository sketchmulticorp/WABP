import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  providerCredentialsInApp,
  whatsappAccountsInApp,
} from "../database/schema/index.js";
import type { DevelopmentConnectionInput } from "./whatsapp.dto.js";

@Injectable()
export class WhatsAppRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  listAccounts(tenantId: string) {
    return this.database
      .select({
        id: whatsappAccountsInApp.id,
        businessId: whatsappAccountsInApp.businessId,
        displayName: whatsappAccountsInApp.displayName,
        displayPhone: whatsappAccountsInApp.displayPhone,
        health: whatsappAccountsInApp.health,
        isDefault: whatsappAccountsInApp.isDefault,
        lastSyncedAt: whatsappAccountsInApp.lastSyncedAt,
        phoneNumberId: whatsappAccountsInApp.phoneNumberId,
        status: whatsappAccountsInApp.status,
        wabaId: whatsappAccountsInApp.wabaId,
      })
      .from(whatsappAccountsInApp)
      .where(eq(whatsappAccountsInApp.tenantId, tenantId))
      .orderBy(whatsappAccountsInApp.createdAt);
  }

  async findAccountForProvider(tenantId: string, accountId: string) {
    const rows = await this.database
      .select({
        credentialReference: providerCredentialsInApp.secretRef,
        credentialStatus: providerCredentialsInApp.status,
        displayName: whatsappAccountsInApp.displayName,
        displayPhone: whatsappAccountsInApp.displayPhone,
        id: whatsappAccountsInApp.id,
        phoneNumberId: whatsappAccountsInApp.phoneNumberId,
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

  async applySync(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
    input: {
      readonly displayName: string | null;
      readonly displayPhone: string;
      readonly health: "CONNECTED" | "DEGRADED";
      readonly qualityRating: string | null;
    },
  ) {
    const now = new Date().toISOString();
    const rows = await transaction
      .update(whatsappAccountsInApp)
      .set({
        displayName: input.displayName,
        displayPhone: input.displayPhone,
        health: {
          checked_at: now,
          quality_rating: input.qualityRating,
          source: "meta_phone_numbers_sync",
        },
        lastSyncedAt: now,
        status: input.health,
        updatedAt: now,
      })
      .where(
        and(eq(whatsappAccountsInApp.tenantId, tenantId), eq(whatsappAccountsInApp.id, accountId)),
      )
      .returning({
        id: whatsappAccountsInApp.id,
        displayName: whatsappAccountsInApp.displayName,
        displayPhone: whatsappAccountsInApp.displayPhone,
        health: whatsappAccountsInApp.health,
        lastSyncedAt: whatsappAccountsInApp.lastSyncedAt,
        status: whatsappAccountsInApp.status,
      });
    return rows[0];
  }

  async recordProviderFailure(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
    status: "AUTH_FAILED" | "DEGRADED",
  ) {
    const now = new Date().toISOString();
    await transaction
      .update(whatsappAccountsInApp)
      .set({ health: { checked_at: now, source: "meta_sync_failed" }, status, updatedAt: now })
      .where(
        and(eq(whatsappAccountsInApp.tenantId, tenantId), eq(whatsappAccountsInApp.id, accountId)),
      );
    if (status === "AUTH_FAILED") {
      await transaction
        .update(providerCredentialsInApp)
        .set({ lastValidatedAt: now, status: "INVALID", updatedAt: now })
        .where(
          and(
            eq(providerCredentialsInApp.tenantId, tenantId),
            eq(providerCredentialsInApp.whatsappAccountId, accountId),
          ),
        );
    }
  }

  async disconnectAccount(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
  ) {
    const now = new Date().toISOString();
    const current = await transaction
      .select({ id: whatsappAccountsInApp.id, isDefault: whatsappAccountsInApp.isDefault })
      .from(whatsappAccountsInApp)
      .where(
        and(eq(whatsappAccountsInApp.tenantId, tenantId), eq(whatsappAccountsInApp.id, accountId)),
      )
      .limit(1);
    const account = current[0];
    if (account === undefined) return undefined;
    await transaction
      .update(whatsappAccountsInApp)
      .set({
        health: { disconnected_at: now, source: "local_development_disconnect" },
        isDefault: false,
        status: "DISCONNECTED",
        updatedAt: now,
      })
      .where(
        and(eq(whatsappAccountsInApp.tenantId, tenantId), eq(whatsappAccountsInApp.id, accountId)),
      );
    await transaction
      .update(providerCredentialsInApp)
      .set({ status: "REVOKED", updatedAt: now })
      .where(
        and(
          eq(providerCredentialsInApp.tenantId, tenantId),
          eq(providerCredentialsInApp.whatsappAccountId, accountId),
        ),
      );
    if (account.isDefault) {
      const replacement = await transaction
        .select({ id: whatsappAccountsInApp.id })
        .from(whatsappAccountsInApp)
        .where(
          and(
            eq(whatsappAccountsInApp.tenantId, tenantId),
            ne(whatsappAccountsInApp.id, accountId),
            eq(whatsappAccountsInApp.status, "CONNECTED"),
          ),
        )
        .limit(1);
      if (replacement[0] !== undefined) {
        await transaction
          .update(whatsappAccountsInApp)
          .set({ isDefault: true, updatedAt: now })
          .where(eq(whatsappAccountsInApp.id, replacement[0].id));
      }
    }
    return { id: account.id };
  }

  async connectDevelopmentAccount(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: DevelopmentConnectionInput,
  ) {
    const current = await transaction
      .select({ id: whatsappAccountsInApp.id })
      .from(whatsappAccountsInApp)
      .where(
        and(
          eq(whatsappAccountsInApp.tenantId, tenantId),
          eq(whatsappAccountsInApp.status, "CONNECTED"),
        ),
      )
      .limit(1);
    const rows = await transaction
      .insert(whatsappAccountsInApp)
      .values({
        tenantId,
        provider: "META",
        businessId: input.businessId,
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        displayPhone: input.displayPhone,
        displayName: input.displayName,
        status: "CONNECTED",
        isDefault: current.length === 0,
        health: { source: "development_manual_connection" },
      })
      .returning({
        id: whatsappAccountsInApp.id,
        displayPhone: whatsappAccountsInApp.displayPhone,
        status: whatsappAccountsInApp.status,
        wabaId: whatsappAccountsInApp.wabaId,
        phoneNumberId: whatsappAccountsInApp.phoneNumberId,
      });
    const account = rows[0];
    if (account === undefined) throw new Error("WhatsApp account insert did not return a row.");
    await transaction.insert(providerCredentialsInApp).values({
      tenantId,
      whatsappAccountId: account.id,
      provider: "META",
      secretRef: input.secretRef,
      status: "ACTIVE",
    });
    return account;
  }

  async recordConnectionAudit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly accountId: string;
      readonly actorId: string;
      readonly requestId: string;
      readonly tenantId: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: "TENANT_ADMIN",
      action: "WHATSAPP_DEVELOPMENT_CONNECTED",
      entityType: "whatsapp_account",
      entityId: input.accountId,
      result: "SUCCESS",
      metadata: {},
      requestId: input.requestId,
    });
  }

  async recordAccountAudit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly accountId: string;
      readonly action: string;
      readonly actorId: string;
      readonly requestId: string;
      readonly tenantId: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: "TENANT_ADMIN",
      action: input.action,
      entityType: "whatsapp_account",
      entityId: input.accountId,
      result: "SUCCESS",
      metadata: {},
      requestId: input.requestId,
    });
  }
}
