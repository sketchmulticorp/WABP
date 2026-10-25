import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { auditLogsInApp, usersInApp } from "../database/schema/index.js";

const COMPLETED_ACTION = "FIRST_SUPER_ADMIN_BOOTSTRAPPED";

/** Persistence barrier only; BootstrapService decides whether initialization is allowed. */
@Injectable()
export class BootstrapRepository {
  async boundLockWait(transaction: AppDatabaseTransaction): Promise<void> {
    // Keep an HTTP initialization attempt from occupying a pool slot indefinitely.
    await transaction.execute(sql`set local lock_timeout = '5s'`);
  }

  async lockUserCreation(transaction: AppDatabaseTransaction): Promise<void> {
    // Unlike an advisory lock alone, this also serializes ordinary concurrent INSERTs.
    await transaction.execute(sql`lock table ${usersInApp} in share row exclusive mode`);
  }

  async hasAnyUserIncludingDeleted(transaction: AppDatabaseTransaction): Promise<boolean> {
    // Deliberate bootstrap safety exception: deleted users must never reopen initialization.
    const rows = await transaction.select({ id: usersInApp.id }).from(usersInApp).limit(1);
    return rows.length > 0;
  }

  async hasCompletionMarker(transaction: AppDatabaseTransaction): Promise<boolean> {
    const rows = await transaction
      .select({ id: auditLogsInApp.id })
      .from(auditLogsInApp)
      .where(eq(auditLogsInApp.action, COMPLETED_ACTION))
      .limit(1);
    return rows.length > 0;
  }

  async recordCompletion(
    transaction: AppDatabaseTransaction,
    userId: string,
    requestId: string,
  ): Promise<void> {
    await transaction.insert(auditLogsInApp).values({
      actorId: userId,
      actorRole: "SUPER_ADMIN",
      action: COMPLETED_ACTION,
      entityType: "user",
      entityId: userId,
      result: "SUCCESS",
      requestId,
      metadata: { initialization: "first_super_admin" },
    });
  }
}
