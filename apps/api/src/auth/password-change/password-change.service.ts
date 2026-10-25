import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { Argon2idPasswordHasher } from "../../common/security/password-hasher.js";
import { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import { AuthRepository } from "../auth.repository.js";
import { isEligibleAuthPrincipal } from "../auth-principal.policy.js";
import { LoginRateLimiterAdapter } from "../login-rate-limiter.adapter.js";
import { PasswordChangeRepository } from "./password-change.repository.js";
import { PasswordChangeError } from "./password-change.error.js";
import type { PasswordChangeInput } from "./password-change.dto.js";

/** Own password changes and initial handover share verification, locking and session revocation. */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly repository: PasswordChangeRepository,
    private readonly auth: AuthRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly hasher: Argon2idPasswordHasher,
    private readonly limiter: LoginRateLimiterAdapter,
  ) {}

  async complete(context: AuthorizationContext, input: PasswordChangeInput): Promise<void> {
    if (context.passwordChangeRequired !== true)
      throw new PasswordChangeError("PASSWORD_CHANGE_NOT_REQUIRED");
    await this.change(context, input, true);
  }

  /** Ordinary self-service change shares the initial-handover authentication barrier. */
  async changeOwn(context: AuthorizationContext, input: PasswordChangeInput): Promise<void> {
    if (context.passwordChangeRequired === true)
      throw new PasswordChangeError("PASSWORD_CHANGE_SESSION_INVALID");
    await this.change(context, input, false);
  }

  private async change(
    context: AuthorizationContext,
    input: PasswordChangeInput,
    initial: boolean,
  ): Promise<void> {
    try {
      const key = `password-change:${context.actorId}`;
      if (!(await this.limiter.consume(key, key)).allowed)
        throw new PasswordChangeError("PASSWORD_CHANGE_RATE_LIMITED");
      const before = await this.repository.findCredentials(context.actorId);
      if (initial && before?.required !== true)
        throw new PasswordChangeError("PASSWORD_CHANGE_NOT_REQUIRED");
      if (before?.required !== initial)
        throw new PasswordChangeError("PASSWORD_CHANGE_SESSION_INVALID");
      if (!(await this.hasher.verify(input.currentPassword, before.passwordHash)))
        throw new PasswordChangeError("CURRENT_PASSWORD_INVALID");
      if (await this.hasher.verify(input.newPassword, before.passwordHash))
        throw new PasswordChangeError("NEW_PASSWORD_REUSED");
      const passwordHash = await this.hasher.hash(input.newPassword);
      await this.transactions.execute(
        async (transaction) => {
          // Same order as login/refresh: user advisory lock before credential/session row locks.
          await this.auth.lockUserAuthentication(transaction, context.actorId);
          const current = await this.repository.lockCredentials(transaction, context.actorId);
          const principal = await this.auth.findPrincipalById(transaction, context.actorId);
          if (
            current?.required !== initial ||
            current.passwordHash !== before.passwordHash ||
            principal === undefined ||
            !isEligibleAuthPrincipal(principal) ||
            principal.homeTenantId !== context.tenantId ||
            principal.roleSystemKey !== context.roleSystemKey ||
            !(await this.repository.sessionIsActive(
              transaction,
              context.actorId,
              context.sessionId,
            ))
          ) {
            throw new PasswordChangeError("PASSWORD_CHANGE_SESSION_INVALID");
          }
          await this.repository.complete(
            transaction,
            context.actorId,
            passwordHash,
            context.requestId,
            context.tenantId,
            initial,
          );
        },
        { isolationLevel: "read committed" },
      );
    } catch (error: unknown) {
      if (error instanceof PasswordChangeError) throw error;
      // SQL exceptions can contain credential hashes; never forward their cause to HTTP logs.
      throw new PasswordChangeError("PASSWORD_CHANGE_UNAVAILABLE");
    }
  }
}
