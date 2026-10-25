import { ConflictException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateTenantUserResponse,
  DeleteTenantUserResponse,
  TenantUserListResponse,
  TenantUserStatusResponse,
  TenantUserSummary,
} from "@whatsapp-platform/contracts";

import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { ChangeTenantUserStatusInput, CreateTenantUserInput } from "./user.dto.js";
import { UserRepository } from "./user.repository.js";

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
    private readonly passwordHasher: Argon2idPasswordHasher,
  ) {}

  async list(context: AuthorizationContext): Promise<TenantUserListResponse> {
    const tenant = this.requireTenantAdmin(context);
    return { users: await this.repository.list(tenant.tenantId) };
  }

  async create(
    context: AuthorizationContext,
    input: CreateTenantUserInput,
  ): Promise<CreateTenantUserResponse> {
    const tenant = this.requireTenantAdmin(context);
    const passwordHash = await this.passwordHasher.hash(input.initialPassword);
    try {
      return await this.transactions.execute(async (transaction) => {
        const role = await this.repository.findSystemTenantUserRole(transaction, tenant.tenantId);
        const deleted = await this.repository.findDeletedByEmailForUpdate(transaction, input.email);
        if (deleted.length > 1) throw ambiguousUserRestore();
        const deletedUser = deleted[0];
        if (deletedUser !== undefined && deletedUser.homeTenantId !== tenant.tenantId) {
          throw userEmailUnavailable();
        }
        let restored = false;
        let created;
        if (deletedUser === undefined) {
          created = await this.repository.createTenantUser(transaction, {
            displayName: input.displayName,
            email: input.email,
            passwordHash,
            roleId: role.id,
            tenantId: tenant.tenantId,
          });
        } else {
          const memberships = await this.repository.findMembershipsForUpdate(
            transaction,
            deletedUser.id,
          );
          const activeForeign = memberships.some(
            (membership) => !membership.isDeleted && membership.tenantId !== tenant.tenantId,
          );
          const matching = memberships.filter(
            (membership) => membership.tenantId === tenant.tenantId,
          );
          if (activeForeign || matching.length > 1) throw ambiguousUserRestore();
          created = await this.repository.restoreTenantUser(transaction, {
            displayName: input.displayName,
            email: input.email,
            passwordHash,
            roleId: role.id,
            tenantId: tenant.tenantId,
            userId: deletedUser.id,
          });
          if (created === undefined)
            throw new Error("Tenant User restoration did not return a row.");
          const membership = matching[0];
          if (membership === undefined) {
            await this.repository.createMembership(transaction, {
              roleId: role.id,
              tenantId: tenant.tenantId,
              userId: deletedUser.id,
            });
          } else {
            await this.repository.restoreMembership(transaction, {
              membershipId: membership.id,
              roleId: role.id,
              tenantId: tenant.tenantId,
            });
          }
          restored = true;
        }
        await this.repository.auditCreation(transaction, {
          actorId: context.actorId,
          actorRole: context.roleSystemKey,
          requestId: context.requestId,
          tenantId: tenant.tenantId,
          userId: created.id,
          restored,
        });
        return {
          user: {
            created_at: created.createdAt,
            display_name: created.displayName,
            email: created.email,
            id: created.id,
            role: created.role,
            status: created.status,
          },
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("An active user with that email address already exists.");
      }
      throw error;
    }
  }

  async changeStatus(
    context: AuthorizationContext,
    userId: string,
    input: ChangeTenantUserStatusInput,
  ): Promise<TenantUserStatusResponse> {
    const tenant = this.requireTenantAdmin(context);
    if (userId === context.actorId) throw tenantUserNotFound();
    return this.transactions.execute(async (transaction) => {
      const target = await this.repository.findTenantUserForUpdate(
        transaction,
        tenant.tenantId,
        userId,
      );
      if (target === undefined || target.isDeleted || target.membershipIsDeleted) {
        throw tenantUserNotFound();
      }
      if (target.status === input.status) return { user: tenantUserSummary(target) };
      const updated = await this.repository.changeStatus(transaction, userId, input.status);
      if (updated === undefined) throw tenantUserNotFound();
      await this.repository.auditAccountChange(transaction, {
        action: input.status === "ACTIVE" ? "TENANT_USER_ACTIVATED" : "TENANT_USER_DEACTIVATED",
        actorId: context.actorId,
        actorRole: context.roleSystemKey,
        requestId: context.requestId,
        tenantId: tenant.tenantId,
        userId,
      });
      return { user: tenantUserSummary(updated) };
    });
  }

  async remove(context: AuthorizationContext, userId: string): Promise<DeleteTenantUserResponse> {
    const tenant = this.requireTenantAdmin(context);
    if (userId === context.actorId) throw tenantUserNotFound();
    return this.transactions.execute(async (transaction) => {
      const target = await this.repository.findTenantUserForUpdate(
        transaction,
        tenant.tenantId,
        userId,
      );
      if (target === undefined) throw tenantUserNotFound();
      if (target.isDeleted && target.membershipIsDeleted) return { deleted: true, id: userId };
      if (target.isDeleted || target.membershipIsDeleted) throw inconsistentAccountState();
      const deleted = await this.repository.softDeleteTenantUser(transaction, {
        actorId: context.actorId,
        membershipId: target.membershipId,
        userId,
      });
      if (deleted === undefined) throw tenantUserNotFound();
      await this.repository.auditAccountChange(transaction, {
        action: "TENANT_USER_DELETED",
        actorId: context.actorId,
        actorRole: context.roleSystemKey,
        requestId: context.requestId,
        tenantId: tenant.tenantId,
        userId,
      });
      return { deleted: true, id: userId };
    });
  }

  private requireTenantAdmin(context: AuthorizationContext) {
    const tenant = this.tenantScope.requireTenantContext(context);
    if (context.roleSystemKey !== "TENANT_ADMIN") {
      throw forbiddenError("Only the Tenant Admin can manage tenant users.");
    }
    return tenant;
  }
}

function tenantUserSummary(input: {
  readonly createdAt: string;
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly status: string;
}): TenantUserSummary {
  if (!["ACTIVE", "DISABLED", "INVITED", "LOCKED"].includes(input.status)) {
    throw new Error("Persisted Tenant User has an invalid status.");
  }
  return {
    created_at: input.createdAt,
    display_name: input.displayName,
    email: input.email,
    id: input.id,
    role: "TENANT_USER",
    status: input.status as TenantUserSummary["status"],
  };
}

function tenantUserNotFound(): ApplicationError {
  return new ApplicationError({
    code: "TENANT_USER_NOT_FOUND",
    message: "Tenant User not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function inconsistentAccountState(): ApplicationError {
  return new ApplicationError({
    code: "TENANT_USER_STATE_INVALID",
    message: "The Tenant User account requires explicit administrative review.",
    statusCode: HttpStatus.CONFLICT,
  });
}

function ambiguousUserRestore(): ConflictException {
  return new ConflictException(
    "The deleted account identity or tenant membership is ambiguous and requires explicit review.",
  );
}

function userEmailUnavailable(): ConflictException {
  return new ConflictException("That email address is unavailable for this tenant.");
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      current.code === "23505"
    ) {
      return true;
    }
    if (!(current instanceof Error)) return false;
    current = current.cause;
  }
  return false;
}
