import { HttpStatus, Injectable } from "@nestjs/common";

import { TenantScopeService } from "../authorization/authorization.service.js";
import type {
  AuthorizationContext,
  TenantRepositoryContext,
} from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { CreateGroupInput, GroupMembersInput, UpdateGroupInput } from "./group.dto.js";
import { GroupRepository } from "./group.repository.js";

@Injectable()
export class GroupService {
  constructor(
    private readonly repository: GroupRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async list(context: AuthorizationContext) {
    return {
      groups: await this.repository.list(this.tenantScope.requireTenantContext(context).tenantId),
    };
  }

  async create(context: AuthorizationContext, input: CreateGroupInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    try {
      return await this.transactions.execute(async (transaction) => {
        const deleted = await this.repository.findDeletedByNameForUpdate(
          transaction,
          tenant.tenantId,
          input.name,
        );
        if (deleted.length > 1) throw ambiguousGroupRestore();
        const deletedGroup = deleted[0];
        const group =
          deletedGroup === undefined
            ? await this.repository.create(transaction, tenant.tenantId, input.name)
            : await this.repository.restore(
                transaction,
                tenant.tenantId,
                deletedGroup.id,
                input.name,
              );
        if (group === undefined) throw new Error("Group creation did not return a row.");
        await this.audit(
          transaction,
          tenant,
          context,
          group.id,
          deletedGroup === undefined ? "CONTACT_GROUP_CREATED" : "CONTACT_GROUP_RESTORED",
        );
        return group;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw groupNameExists();
      throw error;
    }
  }

  async update(context: AuthorizationContext, groupId: string, input: UpdateGroupInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    try {
      return await this.transactions.execute(async (transaction) => {
        const group = await this.repository.update(
          transaction,
          tenant.tenantId,
          groupId,
          input.name,
        );
        if (group === undefined) throw groupNotFound();
        await this.audit(transaction, tenant, context, group.id, "CONTACT_GROUP_UPDATED");
        return group;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw groupNameExists();
      throw error;
    }
  }

  async remove(context: AuthorizationContext, groupId: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return this.transactions.execute(async (transaction) => {
      const group = await this.repository.softDelete(
        transaction,
        tenant.tenantId,
        groupId,
        context.actorId,
      );
      if (group === undefined) throw groupNotFound();
      await this.audit(transaction, tenant, context, group.id, "CONTACT_GROUP_DELETED");
      return { deleted: true, id: group.id };
    });
  }

  async listMembers(context: AuthorizationContext, groupId: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return { members: await this.repository.listMembers(tenant.tenantId, groupId) };
  }

  async addMembers(context: AuthorizationContext, groupId: string, input: GroupMembersInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return this.transactions.execute(async (transaction) => {
      if (!(await this.repository.hasActiveGroup(transaction, tenant.tenantId, groupId))) {
        throw groupNotFound();
      }
      const activeIds = await this.repository.activeContactIds(
        transaction,
        tenant.tenantId,
        input.contactIds,
      );
      if (activeIds.size !== input.contactIds.length) throw memberContactNotFound();
      let added = 0;
      for (const contactId of input.contactIds) {
        if (
          await this.repository.addOrRestoreMember(transaction, tenant.tenantId, groupId, contactId)
        )
          added += 1;
      }
      await this.audit(transaction, tenant, context, groupId, "CONTACT_GROUP_MEMBERS_ADDED");
      return { added, group_id: groupId };
    });
  }

  async removeMember(context: AuthorizationContext, groupId: string, contactId: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return this.transactions.execute(async (transaction) => {
      if (!(await this.repository.hasActiveGroup(transaction, tenant.tenantId, groupId))) {
        throw groupNotFound();
      }
      const membership = await this.repository.removeMember(
        transaction,
        tenant.tenantId,
        groupId,
        contactId,
        context.actorId,
      );
      if (membership === undefined) throw groupMemberNotFound();
      await this.audit(transaction, tenant, context, groupId, "CONTACT_GROUP_MEMBER_REMOVED");
      return { deleted: true, group_id: groupId, contact_id: contactId };
    });
  }

  private audit(
    transaction: AppDatabaseTransaction,
    tenant: TenantRepositoryContext,
    context: AuthorizationContext,
    groupId: string,
    action: string,
  ) {
    return this.repository.audit(transaction, {
      action,
      actorId: context.actorId,
      actorRole: tenant.roleSystemKey,
      entityId: groupId,
      requestId: context.requestId,
      tenantId: tenant.tenantId,
    });
  }
}

function groupNotFound() {
  return new ApplicationError({
    code: "CONTACT_GROUP_NOT_FOUND",
    message: "Group not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function groupMemberNotFound() {
  return new ApplicationError({
    code: "CONTACT_GROUP_MEMBER_NOT_FOUND",
    message: "Group member not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function memberContactNotFound() {
  return new ApplicationError({
    code: "CONTACT_GROUP_MEMBER_CONTACT_NOT_FOUND",
    message: "One or more contacts were not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function groupNameExists() {
  return new ApplicationError({
    code: "CONTACT_GROUP_NAME_EXISTS",
    message: "An active Group already has this name.",
    statusCode: HttpStatus.CONFLICT,
  });
}

function ambiguousGroupRestore() {
  return new ApplicationError({
    code: "RESTORE_IDENTITY_AMBIGUOUS",
    message: "Multiple deleted Groups use this name. Restore one explicitly.",
    statusCode: HttpStatus.CONFLICT,
  });
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the PostgreSQL error. Inspect only bounded Error causes, never SQL/params.
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      current.code === "23505"
    )
      return true;
    if (!(current instanceof Error)) return false;
    current = current.cause;
  }
  return false;
}
