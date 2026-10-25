import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { APP_DATABASE } from "../../database/database.constants.js";
import type {
  AppDatabase,
  AppDatabaseExecutor,
  AppDatabaseTransaction,
} from "../../database/database.types.js";
import { usersInApp, authSessionsInApp, auditLogsInApp } from "../../database/schema/index.js";

/** All credential/session persistence stays behind this repository boundary. */
@Injectable()
export class PasswordChangeRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async findCredentials(userId: string) {
    return (await this.credentials(this.database, userId))[0];
  }

  async lockCredentials(transaction: AppDatabaseTransaction, userId: string) {
    return (await this.credentials(transaction, userId).for("update"))[0];
  }

  async sessionIsActive(
    transaction: AppDatabaseTransaction,
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const rows = await transaction
      .select({ expiresAt: authSessionsInApp.expiresAt })
      .from(authSessionsInApp)
      .where(
        and(
          eq(authSessionsInApp.id, sessionId),
          eq(authSessionsInApp.userId, userId),
          isNull(authSessionsInApp.revokedAt),
        ),
      )
      .limit(1)
      .for("update");
    return rows[0] !== undefined && Date.parse(rows[0].expiresAt) > Date.now();
  }

  async complete(
    transaction: AppDatabaseTransaction,
    userId: string,
    passwordHash: string,
    requestId: string,
    tenantId: string | null,
    initial = true,
  ): Promise<void> {
    await transaction
      .update(usersInApp)
      .set({
        passwordHash,
        mustChangePassword: false,
        tokenVersion: sql`${usersInApp.tokenVersion} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(usersInApp.id, userId),
          eq(usersInApp.isDeleted, false),
          eq(usersInApp.mustChangePassword, initial),
        ),
      );
    await transaction
      .update(authSessionsInApp)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(authSessionsInApp.userId, userId), isNull(authSessionsInApp.revokedAt)));
    await transaction.insert(auditLogsInApp).values({
      tenantId,
      actorId: userId,
      action: initial ? "INITIAL_PASSWORD_CHANGED" : "PASSWORD_CHANGED",
      entityType: "user",
      entityId: userId,
      requestId,
      result: "SUCCESS",
      metadata: { all_sessions_revoked: true },
    });
  }

  private credentials(executor: AppDatabaseExecutor, userId: string) {
    return executor
      .select({ passwordHash: usersInApp.passwordHash, required: usersInApp.mustChangePassword })
      .from(usersInApp)
      .where(
        and(
          eq(usersInApp.id, userId),
          eq(usersInApp.isDeleted, false),
          eq(usersInApp.status, "ACTIVE"),
        ),
      )
      .limit(1);
  }
}
