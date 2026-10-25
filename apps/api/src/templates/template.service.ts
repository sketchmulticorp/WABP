import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { WHATSAPP_PROVIDER } from "../whatsapp/whatsapp-provider.constants.js";
import type { WhatsAppProvider } from "../whatsapp/whatsapp-provider.types.js";
import type { CreateTemplateInput, UpdateTemplateInput } from "./template.dto.js";
import { TemplateRepository } from "./template.repository.js";

@Injectable()
export class TemplateService {
  constructor(
    private readonly repository: TemplateRepository,
    private readonly transactions: DatabaseTransactionManager,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  list(context: AuthorizationContext) {
    return this.repository.list(requireTenant(context));
  }

  async create(context: AuthorizationContext, input: CreateTemplateInput) {
    const tenantId = requireTenant(context);
    await this.requireConnectedAccount(tenantId, input.whatsappAccountId);
    return this.transactions.execute(async (transaction) => {
      try {
        const template = await this.repository.create(
          transaction,
          tenantId,
          isTenantAdmin(context) ? "NOT_REQUIRED" : "DRAFT",
          input,
        );
        if (template === undefined) throw new Error("Template creation did not return a row.");
        await this.repository.audit(
          transaction,
          auditInput(context, tenantId, template.id, "TEMPLATE_CREATED"),
        );
        return template;
      } catch (error) {
        if (isUnique(error))
          throw new ConflictException("A template with that name and language already exists.");
        throw error;
      }
    });
  }

  async update(context: AuthorizationContext, templateId: string, input: UpdateTemplateInput) {
    const tenantId = requireTenant(context);
    return this.transactions.execute(async (transaction) => {
      try {
        const template = await this.repository.updateMaterial(
          transaction,
          tenantId,
          templateId,
          isTenantAdmin(context) ? "NOT_REQUIRED" : "DRAFT",
          input,
        );
        if (template === undefined) throw versionConflict();
        await this.repository.audit(
          transaction,
          auditInput(context, tenantId, template.id, "TEMPLATE_UPDATED"),
        );
        return template;
      } catch (error) {
        if (isUnique(error))
          throw new ConflictException("A template with that name and language already exists.");
        throw error;
      }
    });
  }

  async requestApproval(
    context: AuthorizationContext,
    templateId: string,
    expectedContentVersion: number,
  ) {
    const tenantId = requireTenant(context);
    if (isTenantAdmin(context)) {
      throw new ApplicationError({
        code: "TEMPLATE_APPROVAL_NOT_REQUIRED",
        message: "Tenant Admin templates do not require internal approval.",
        statusCode: HttpStatus.CONFLICT,
      });
    }
    return this.transactions.execute(async (transaction) => {
      const template = await this.repository.requestApproval(
        transaction,
        tenantId,
        templateId,
        context.actorId,
        expectedContentVersion,
      );
      if (template === undefined) throw versionConflict();
      await this.repository.audit(
        transaction,
        auditInput(context, tenantId, template.id, "TEMPLATE_APPROVAL_REQUESTED"),
      );
      return template;
    });
  }

  async approve(context: AuthorizationContext, templateId: string, expectedContentVersion: number) {
    return this.review(context, templateId, expectedContentVersion, {
      approvalRejectionReason: null,
      approvalStatus: "APPROVED",
    });
  }

  async reject(
    context: AuthorizationContext,
    templateId: string,
    expectedContentVersion: number,
    reason: string,
  ) {
    return this.review(context, templateId, expectedContentVersion, {
      approvalRejectionReason: reason,
      approvalStatus: "REJECTED",
    });
  }

  async preview(context: AuthorizationContext, templateId: string) {
    const template = await this.repository.findActive(requireTenant(context), templateId);
    if (template === undefined) throw new NotFoundException("Template not found.");
    return { ...template, preview: buildPreview(template.components) };
  }

  async sync(context: AuthorizationContext, accountId: string) {
    const tenantId = requireTenant(context);
    const account = await this.requireConnectedAccount(tenantId, accountId);
    const providerTemplates = await this.provider.syncTemplates({
      accountId: account.id,
      credentialReference: account.credentialReference,
      wabaId: account.wabaId,
    });
    return this.transactions.execute(async (transaction) => {
      const templates = [];
      for (const providerTemplate of providerTemplates) {
        const template = await this.repository.syncProviderTemplate(
          transaction,
          tenantId,
          accountId,
          providerTemplate,
        );
        if (template !== undefined) templates.push(template);
      }
      await this.repository.audit(
        transaction,
        auditInput(context, tenantId, accountId, "TEMPLATES_SYNCED"),
      );
      return { synchronized: templates.length, templates };
    });
  }

  private async review(
    context: AuthorizationContext,
    templateId: string,
    expectedContentVersion: number,
    decision: {
      readonly approvalRejectionReason: string | null;
      readonly approvalStatus: "APPROVED" | "REJECTED";
    },
  ) {
    const tenantId = requireTenant(context);
    if (!isTenantAdmin(context)) {
      throw new ApplicationError({
        code: "FORBIDDEN",
        message: "Tenant Admin access is required.",
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    const current = await this.repository.findActive(tenantId, templateId);
    if (current === undefined) throw new NotFoundException("Template not found.");
    if (current.approvalRequestedBy === context.actorId) {
      throw new ApplicationError({
        code: "FORBIDDEN",
        message: "A requester cannot review their own template.",
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    return this.transactions.execute(async (transaction) => {
      const template = await this.repository.review(
        transaction,
        tenantId,
        templateId,
        context.actorId,
        expectedContentVersion,
        decision,
      );
      if (template === undefined) throw versionConflict();
      await this.repository.audit(
        transaction,
        auditInput(context, tenantId, template.id, `TEMPLATE_${decision.approvalStatus}`),
      );
      return template;
    });
  }

  private async requireConnectedAccount(tenantId: string, accountId: string) {
    const account = await this.repository.findProviderAccount(tenantId, accountId);
    if (account === undefined) throw new NotFoundException("WhatsApp account not found.");
    if (account.status !== "CONNECTED" || account.credentialStatus !== "ACTIVE") {
      throw new ApplicationError({
        code: "WHATSAPP_ACCOUNT_NOT_CONNECTED",
        message: "A connected WhatsApp account is required.",
        statusCode: HttpStatus.CONFLICT,
      });
    }
    return account;
  }
}

function requireTenant(context: AuthorizationContext): string {
  if (context.tenantId !== null) return context.tenantId;
  throw new ApplicationError({
    code: "FORBIDDEN",
    message: "Tenant access is required.",
    statusCode: HttpStatus.FORBIDDEN,
  });
}

function isTenantAdmin(context: AuthorizationContext): boolean {
  return context.roleSystemKey === "TENANT_ADMIN";
}

function versionConflict(): ApplicationError {
  return new ApplicationError({
    code: "TEMPLATE_VERSION_CONFLICT",
    message: "The template changed or is not in the required state.",
    statusCode: HttpStatus.CONFLICT,
  });
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function auditInput(
  context: AuthorizationContext,
  tenantId: string,
  entityId: string,
  action: string,
) {
  return { action, actorId: context.actorId, entityId, requestId: context.requestId, tenantId };
}

function buildPreview(components: unknown): {
  readonly body: string | null;
  readonly footer: string | null;
  readonly header: string | null;
} {
  const values: readonly unknown[] = Array.isArray(components)
    ? (components as readonly unknown[])
    : [];
  const textFor = (type: string) => {
    const component = values.find(
      (value) =>
        isRecord(value) && typeof value.type === "string" && value.type.toUpperCase() === type,
    );
    return isRecord(component) && typeof component.text === "string" ? component.text : null;
  };
  return { body: textFor("BODY"), footer: textFor("FOOTER"), header: textFor("HEADER") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
