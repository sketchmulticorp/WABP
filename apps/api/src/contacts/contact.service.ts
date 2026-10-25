import { HttpStatus, Injectable } from "@nestjs/common";
import { normalizePhoneNumber, toCountryCode } from "@whatsapp-platform/contact-normalization";

import { TenantScopeService } from "../authorization/authorization.service.js";
import type {
  AuthorizationContext,
  TenantRepositoryContext,
} from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type {
  CreateContactInput,
  ListContactsInput,
  UpdateContactConsentInput,
  UpdateContactInput,
} from "./contact.dto.js";
import { formatContactCursor } from "./contact.dto.js";
import { ContactRepository } from "./contact.repository.js";

const INDIA_COUNTRY_CODE = toCountryCode("IN");

@Injectable()
export class ContactService {
  constructor(
    private readonly repository: ContactRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async list(context: AuthorizationContext, input: ListContactsInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    const rows = await this.repository.list(tenant.tenantId, input);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      contacts: page,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? formatContactCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async get(context: AuthorizationContext, contactId: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    const contact = await this.repository.findActive(tenant.tenantId, contactId);
    if (contact === undefined) throw contactNotFound();
    return contact;
  }

  async create(context: AuthorizationContext, input: CreateContactInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    const phoneE164 = normalizePhone(input.phone);
    try {
      return await this.transactions.execute(async (transaction) => {
        await this.validateAssignee(transaction, tenant, input.assignedUserId);
        const deleted = await this.repository.findDeletedByPhoneForUpdate(
          transaction,
          tenant.tenantId,
          phoneE164,
        );
        if (deleted.length > 1) throw ambiguousRestore("Contact");
        const deletedContact = deleted[0];
        const contact =
          deletedContact === undefined
            ? await this.repository.create(transaction, tenant.tenantId, {
                ...input,
                phoneE164,
              })
            : await this.repository.restore(transaction, tenant.tenantId, deletedContact.id, {
                ...input,
                phoneE164,
              });
        if (contact === undefined) throw new Error("Contact creation did not return a row.");
        await this.recordAudit(
          transaction,
          tenant,
          context,
          contact.id,
          deletedContact === undefined ? "CONTACT_CREATED" : "CONTACT_RESTORED",
        );
        return contact;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw contactPhoneExists();
      throw error;
    }
  }

  async update(context: AuthorizationContext, contactId: string, input: UpdateContactInput) {
    const tenant = this.tenantScope.requireTenantContext(context);
    const phoneE164 = input.phone === undefined ? undefined : normalizePhone(input.phone);
    try {
      return await this.transactions.execute(async (transaction) => {
        await this.validateAssignee(transaction, tenant, input.assignedUserId);
        const contact = await this.repository.update(transaction, tenant.tenantId, contactId, {
          ...input,
          ...(phoneE164 === undefined ? {} : { phoneE164 }),
        });
        if (contact === undefined) throw contactNotFound();
        await this.recordAudit(transaction, tenant, context, contact.id, "CONTACT_UPDATED");
        return contact;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw contactPhoneExists();
      throw error;
    }
  }

  async remove(context: AuthorizationContext, contactId: string) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return this.transactions.execute(async (transaction) => {
      const contact = await this.repository.softDelete(
        transaction,
        tenant.tenantId,
        contactId,
        context.actorId,
      );
      if (contact === undefined) throw contactNotFound();
      await this.recordAudit(transaction, tenant, context, contact.id, "CONTACT_DELETED");
      return { deleted: true, id: contact.id };
    });
  }

  async updateConsent(
    context: AuthorizationContext,
    contactId: string,
    input: UpdateContactConsentInput,
  ) {
    const tenant = this.tenantScope.requireTenantContext(context);
    return this.transactions.execute(async (transaction) => {
      const contact = await this.repository.updateConsent(
        transaction,
        tenant.tenantId,
        contactId,
        input,
      );
      if (contact === undefined) throw contactNotFound();
      await this.recordAudit(transaction, tenant, context, contact.id, "CONTACT_CONSENT_UPDATED");
      return contact;
    });
  }

  private async validateAssignee(
    transaction: AppDatabaseTransaction,
    tenant: TenantRepositoryContext,
    assignedUserId: string | null | undefined,
  ): Promise<void> {
    if (assignedUserId === undefined || assignedUserId === null) return;
    if (
      !(await this.repository.isActiveTenantAssignee(transaction, tenant.tenantId, assignedUserId))
    ) {
      throw new ApplicationError({
        code: "CONTACT_ASSIGNEE_INVALID",
        message: "The assigned user is not active in this tenant.",
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private recordAudit(
    transaction: AppDatabaseTransaction,
    tenant: TenantRepositoryContext,
    context: AuthorizationContext,
    contactId: string,
    action:
      | "CONTACT_CONSENT_UPDATED"
      | "CONTACT_CREATED"
      | "CONTACT_DELETED"
      | "CONTACT_RESTORED"
      | "CONTACT_UPDATED",
  ): Promise<void> {
    return this.repository.audit(transaction, {
      action,
      actorId: context.actorId,
      actorRole: tenant.roleSystemKey,
      entityId: contactId,
      requestId: context.requestId,
      tenantId: tenant.tenantId,
    });
  }
}

function ambiguousRestore(entity: string): ApplicationError {
  return new ApplicationError({
    code: "RESTORE_IDENTITY_AMBIGUOUS",
    message: `Multiple deleted ${entity} records use this identity. Restore one explicitly.`,
    statusCode: HttpStatus.CONFLICT,
  });
}

function normalizePhone(value: string): string {
  const normalized = normalizePhoneNumber(value, INDIA_COUNTRY_CODE);
  if (normalized !== null) return normalized.e164;
  throw new ApplicationError({
    code: "CONTACT_PHONE_INVALID",
    message: "The contact phone number is invalid.",
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });
}

function contactNotFound(): ApplicationError {
  return new ApplicationError({
    code: "CONTACT_NOT_FOUND",
    message: "Contact not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function contactPhoneExists(): ApplicationError {
  return new ApplicationError({
    code: "CONTACT_PHONE_EXISTS",
    message: "An active contact already uses this phone number.",
    statusCode: HttpStatus.CONFLICT,
  });
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
