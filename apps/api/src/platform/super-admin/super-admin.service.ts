import { Injectable } from "@nestjs/common";
import type { CreateSuperAdminResponse } from "@whatsapp-platform/contracts";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { AuthRepository } from "../../auth/auth.repository.js";
import { LoginRateLimiterAdapter } from "../../auth/login-rate-limiter.adapter.js";
import { Argon2idPasswordHasher } from "../../common/security/password-hasher.js";
import { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import type { CreateAccountInput } from "../../users/user.dto.js";
import { SuperAdminRepository } from "./super-admin.repository.js";
import { SuperAdminError } from "./super-admin.error.js";

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly repository: SuperAdminRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly hasher: Argon2idPasswordHasher,
    private readonly limiter: LoginRateLimiterAdapter,
    private readonly auth: AuthRepository,
  ) {}

  async create(
    context: AuthorizationContext,
    input: CreateAccountInput,
  ): Promise<CreateSuperAdminResponse> {
    if (
      context.roleSystemKey !== "SUPER_ADMIN" ||
      !context.isPlatformActor ||
      context.tenantId !== null ||
      context.passwordChangeRequired === true ||
      !context.permissions.has("user.invite")
    )
      throw new SuperAdminError("SUPER_ADMIN_FORBIDDEN");
    try {
      const key = `super-admin-create:${context.actorId}`;
      if (!(await this.limiter.consume(key, key)).allowed)
        throw new SuperAdminError("SUPER_ADMIN_RATE_LIMITED");
      const passwordHash = await this.hasher.hash(input.initialPassword);
      return await this.transactions.execute(
        async (tx) => {
          // Serialize with credential/session changes, then recheck live creator eligibility.
          await this.auth.lockUserAuthentication(tx, context.actorId);
          if (
            !(await this.repository.lockCreator(
              tx,
              context.actorId,
              context.roleId,
              context.sessionId,
            ))
          )
            throw new SuperAdminError("SUPER_ADMIN_FORBIDDEN");
          if (await this.repository.isEmailReservedIncludingDeleted(tx, input.email))
            throw new SuperAdminError("SUPER_ADMIN_EMAIL_UNAVAILABLE");
          const user = await this.repository.create(tx, {
            displayName: input.displayName,
            email: input.email,
            passwordHash,
            roleId: context.roleId,
          });
          await this.repository.auditCreation(tx, context.actorId, user.id, context.requestId);
          return {
            user: {
              ...user,
              role: "SUPER_ADMIN",
              status: "ACTIVE",
              password_change_required: true,
            },
          };
        },
        { isolationLevel: "read committed" },
      );
    } catch (error: unknown) {
      if (error instanceof SuperAdminError) throw error;
      if (isUniqueViolation(error)) throw new SuperAdminError("SUPER_ADMIN_EMAIL_UNAVAILABLE");
      // Never forward a driver/hash exception that might embed account or credential inputs.
      throw new SuperAdminError("SUPER_ADMIN_CREATE_UNAVAILABLE");
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if ("code" in current && current.code === "23505") return true;
    current = current.cause;
  }
  return false;
}
