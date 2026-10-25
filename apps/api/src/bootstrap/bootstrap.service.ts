import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { SeedRepository } from "../database/seed/seed.repository.js";
import {
  SUPER_ADMIN_PERMISSION_KEYS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_KEYS,
} from "../database/seed/seed.catalog.js";
import { LoginRateLimiterAdapter } from "../auth/login-rate-limiter.adapter.js";
import { BootstrapRepository } from "./bootstrap.repository.js";
import { BootstrapError } from "./bootstrap.error.js";
import type { FirstSuperAdminInput, FirstSuperAdminResult } from "./bootstrap.types.js";

export const BOOTSTRAP_SECRET = Symbol("BOOTSTRAP_SECRET");

/** One-time initialization only; normal user/tenant administration remains separate. */
@Injectable()
export class BootstrapService {
  constructor(
    @Inject(BOOTSTRAP_SECRET) private readonly secret: string | null,
    private readonly repository: BootstrapRepository,
    private readonly seedRepository: SeedRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly hasher: Argon2idPasswordHasher,
    private readonly limiter: LoginRateLimiterAdapter,
  ) {}

  async createFirstSuperAdmin(
    input: FirstSuperAdminInput,
    suppliedSecret: string | undefined,
    requestId: string,
  ): Promise<FirstSuperAdminResult> {
    if (this.secret === null) throw new BootstrapError("BOOTSTRAP_DISABLED");
    if (
      suppliedSecret === undefined ||
      suppliedSecret.length > 1024 ||
      !timingSafeEqual(digest(suppliedSecret), digest(this.secret))
    ) {
      throw new BootstrapError("BOOTSTRAP_DENIED");
    }
    try {
      // Only secret holders reach Argon2. Reuse existing limits with isolated non-email keys.
      const limit = await this.limiter.consume(
        "bootstrap:first-super-admin",
        "bootstrap:first-super-admin",
      );
      if (!limit.allowed) throw new BootstrapError("BOOTSTRAP_RATE_LIMITED");
      const passwordHash = await this.hasher.hash(input.password);
      return await this.transactions.execute(
        async (transaction) => {
          await this.repository.boundLockWait(transaction);
          await this.seedRepository.acquireTransactionLock(transaction);
          await this.repository.lockUserCreation(transaction);
          if (
            (await this.repository.hasAnyUserIncludingDeleted(transaction)) ||
            (await this.repository.hasCompletionMarker(transaction))
          ) {
            throw new BootstrapError("BOOTSTRAP_CLOSED");
          }
          let role = await this.seedRepository.findActiveRoleBySystemKey(
            transaction,
            SYSTEM_ROLE_KEYS.superAdmin,
            null,
          );
          if (role !== undefined && !role.isSystem)
            throw new BootstrapError("BOOTSTRAP_CATALOG_CONFLICT");
          role ??= await this.seedRepository.createRole(transaction, {
            tenantId: null,
            name: "Super Admin",
            systemKey: SYSTEM_ROLE_KEYS.superAdmin,
            isSystem: true,
          });
          const permissions = await this.seedRepository.upsertPermissions(
            transaction,
            SYSTEM_PERMISSIONS,
          );
          const permissionIds = SUPER_ADMIN_PERMISSION_KEYS.map((key) => {
            const id = permissions.get(key);
            if (id === undefined) throw new BootstrapError("BOOTSTRAP_CATALOG_CONFLICT");
            return id;
          });
          await this.seedRepository.replaceRolePermissions(transaction, role.id, permissionIds);
          const user = await this.seedRepository.createUser(transaction, {
            email: input.email,
            passwordHash,
            displayName: "Super Admin",
            status: "ACTIVE",
            roleId: role.id,
            homeTenantId: null,
          });
          await this.repository.recordCompletion(transaction, user.id, requestId);
          return { user_id: user.id, role: "SUPER_ADMIN" as const };
        },
        { isolationLevel: "read committed" },
      );
    } catch (error: unknown) {
      if (error instanceof BootstrapError) throw error;
      // Never expose/log persistence exceptions that may contain credential hashes or SQL.
      throw new BootstrapError("BOOTSTRAP_UNAVAILABLE");
    }
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
