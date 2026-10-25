import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, inArray } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  contactGroupMembersInApp,
  contactGroupsInApp,
  contactsInApp,
} from "../database/schema/index.js";

@Injectable()
export class GroupRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async list(tenantId: string) {
    const groups = await this.database
      .select({
        createdAt: contactGroupsInApp.createdAt,
        id: contactGroupsInApp.id,
        name: contactGroupsInApp.name,
        updatedAt: contactGroupsInApp.updatedAt,
      })
      .from(contactGroupsInApp)
      .where(
        and(eq(contactGroupsInApp.tenantId, tenantId), eq(contactGroupsInApp.isDeleted, false)),
      )
      .orderBy(contactGroupsInApp.name);
    const counts = await this.database
      .select({ groupId: contactGroupMembersInApp.groupId, memberCount: count() })
      .from(contactGroupMembersInApp)
      .innerJoin(
        contactsInApp,
        and(
          eq(contactGroupMembersInApp.tenantId, contactsInApp.tenantId),
          eq(contactGroupMembersInApp.contactId, contactsInApp.id),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(contactGroupMembersInApp.tenantId, tenantId),
          eq(contactGroupMembersInApp.isDeleted, false),
        ),
      )
      .groupBy(contactGroupMembersInApp.groupId);
    const memberCountByGroupId = new Map(counts.map((item) => [item.groupId, item.memberCount]));
    return groups.map((group) => ({
      ...group,
      memberCount: memberCountByGroupId.get(group.id) ?? 0,
    }));
  }

  async create(transaction: AppDatabaseTransaction, tenantId: string, name: string) {
    const rows = await transaction
      .insert(contactGroupsInApp)
      .values({ name, tenantId })
      .returning(groupProjection());
    return rows[0];
  }

  /** Explicit restore lookup; ordinary Group reads continue excluding deleted rows. */
  findDeletedByNameForUpdate(transaction: AppDatabaseTransaction, tenantId: string, name: string) {
    return transaction
      .select({ id: contactGroupsInApp.id })
      .from(contactGroupsInApp)
      .where(
        and(
          eq(contactGroupsInApp.tenantId, tenantId),
          eq(contactGroupsInApp.name, name),
          eq(contactGroupsInApp.isDeleted, true),
        ),
      )
      .limit(2)
      .for("update");
  }

  async restore(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    groupId: string,
    name: string,
  ) {
    const rows = await transaction
      .update(contactGroupsInApp)
      .set({
        deletedAt: null,
        deletedBy: null,
        isDeleted: false,
        name,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(contactGroupsInApp.tenantId, tenantId),
          eq(contactGroupsInApp.id, groupId),
          eq(contactGroupsInApp.isDeleted, true),
        ),
      )
      .returning(groupProjection());
    return rows[0];
  }

  async update(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    groupId: string,
    name: string,
  ) {
    const rows = await transaction
      .update(contactGroupsInApp)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(contactGroupsInApp.tenantId, tenantId),
          eq(contactGroupsInApp.id, groupId),
          eq(contactGroupsInApp.isDeleted, false),
        ),
      )
      .returning(groupProjection());
    return rows[0];
  }

  async softDelete(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    groupId: string,
    actorId: string,
  ) {
    const deletedAt = new Date().toISOString();
    const rows = await transaction
      .update(contactGroupsInApp)
      .set({ deletedAt, deletedBy: actorId, isDeleted: true, updatedAt: deletedAt })
      .where(
        and(
          eq(contactGroupsInApp.tenantId, tenantId),
          eq(contactGroupsInApp.id, groupId),
          eq(contactGroupsInApp.isDeleted, false),
        ),
      )
      .returning({ id: contactGroupsInApp.id });
    const group = rows[0];
    if (group !== undefined) {
      await transaction
        .update(contactGroupMembersInApp)
        .set({ deletedAt, deletedBy: actorId, isDeleted: true, updatedAt: deletedAt })
        .where(
          and(
            eq(contactGroupMembersInApp.tenantId, tenantId),
            eq(contactGroupMembersInApp.groupId, groupId),
            eq(contactGroupMembersInApp.isDeleted, false),
          ),
        );
    }
    return group;
  }

  async listMembers(tenantId: string, groupId: string) {
    return this.database
      .select({
        email: contactsInApp.email,
        id: contactsInApp.id,
        name: contactsInApp.name,
        phoneE164: contactsInApp.phoneE164,
      })
      .from(contactGroupMembersInApp)
      .innerJoin(
        contactGroupsInApp,
        and(
          eq(contactGroupMembersInApp.tenantId, contactGroupsInApp.tenantId),
          eq(contactGroupMembersInApp.groupId, contactGroupsInApp.id),
          eq(contactGroupsInApp.isDeleted, false),
        ),
      )
      .innerJoin(
        contactsInApp,
        and(
          eq(contactGroupMembersInApp.tenantId, contactsInApp.tenantId),
          eq(contactGroupMembersInApp.contactId, contactsInApp.id),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(contactGroupMembersInApp.tenantId, tenantId),
          eq(contactGroupMembersInApp.groupId, groupId),
          eq(contactGroupMembersInApp.isDeleted, false),
        ),
      )
      .orderBy(contactsInApp.name, contactsInApp.id);
  }

  async hasActiveGroup(transaction: AppDatabaseTransaction, tenantId: string, groupId: string) {
    const rows = await transaction
      .select({ id: contactGroupsInApp.id })
      .from(contactGroupsInApp)
      .where(
        and(
          eq(contactGroupsInApp.tenantId, tenantId),
          eq(contactGroupsInApp.id, groupId),
          eq(contactGroupsInApp.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0] !== undefined;
  }

  async activeContactIds(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    contactIds: readonly string[],
  ) {
    const rows = await transaction
      .select({ id: contactsInApp.id })
      .from(contactsInApp)
      .where(
        and(
          eq(contactsInApp.tenantId, tenantId),
          eq(contactsInApp.isDeleted, false),
          inArray(contactsInApp.id, [...contactIds]),
        ),
      );
    return new Set(rows.map((row) => row.id));
  }

  async addOrRestoreMember(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    groupId: string,
    contactId: string,
  ): Promise<boolean> {
    const rows = await transaction
      .select({ id: contactGroupMembersInApp.id, isDeleted: contactGroupMembersInApp.isDeleted })
      .from(contactGroupMembersInApp)
      .where(
        and(
          eq(contactGroupMembersInApp.tenantId, tenantId),
          eq(contactGroupMembersInApp.groupId, groupId),
          eq(contactGroupMembersInApp.contactId, contactId),
        ),
      )
      .limit(1);
    const membership = rows[0];
    if (membership === undefined) {
      await transaction.insert(contactGroupMembersInApp).values({ contactId, groupId, tenantId });
      return true;
    }
    if (!membership.isDeleted) return false;
    await transaction
      .update(contactGroupMembersInApp)
      .set({
        deletedAt: null,
        deletedBy: null,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(contactGroupMembersInApp.id, membership.id));
    return true;
  }

  async removeMember(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    groupId: string,
    contactId: string,
    actorId: string,
  ) {
    const deletedAt = new Date().toISOString();
    const rows = await transaction
      .update(contactGroupMembersInApp)
      .set({ deletedAt, deletedBy: actorId, isDeleted: true, updatedAt: deletedAt })
      .where(
        and(
          eq(contactGroupMembersInApp.tenantId, tenantId),
          eq(contactGroupMembersInApp.groupId, groupId),
          eq(contactGroupMembersInApp.contactId, contactId),
          eq(contactGroupMembersInApp.isDeleted, false),
        ),
      )
      .returning({ id: contactGroupMembersInApp.id });
    return rows[0];
  }

  async audit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly action: string;
      readonly actorId: string;
      readonly actorRole: string;
      readonly entityId: string;
      readonly requestId: string;
      readonly tenantId: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.entityId,
      entityType: "contact_group",
      metadata: {},
      requestId: input.requestId,
      result: "SUCCESS",
      tenantId: input.tenantId,
    });
  }
}

function groupProjection() {
  return {
    createdAt: contactGroupsInApp.createdAt,
    id: contactGroupsInApp.id,
    name: contactGroupsInApp.name,
    updatedAt: contactGroupsInApp.updatedAt,
  };
}
