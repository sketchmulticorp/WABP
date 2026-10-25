import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { DevelopmentConnectionInput } from "./whatsapp.dto.js";
import { WHATSAPP_PROVIDER } from "./whatsapp-provider.constants.js";
import { WhatsAppProviderError } from "./whatsapp-provider.error.js";
import type { WhatsAppProvider } from "./whatsapp-provider.types.js";
import { WhatsAppRepository } from "./whatsapp.repository.js";
import { WhatsAppOnboardingService } from "./whatsapp-onboarding.service.js";
@Injectable()
export class WhatsAppService {
  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly transactions: DatabaseTransactionManager,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Optional()
    private readonly onboarding: WhatsAppOnboardingService = new WhatsAppOnboardingService({}),
  ) {}

  listAccounts(context: AuthorizationContext) {
    return this.repository.listAccounts(requireTenant(context));
  }

  async connectDevelopmentAccount(
    context: AuthorizationContext,
    input: DevelopmentConnectionInput,
  ) {
    const tenantId = requireTenant(context);
    this.onboarding.requireDevelopmentConnection(context);
    try {
      return await this.transactions.execute(async (transaction) => {
        const account = await this.repository.connectDevelopmentAccount(
          transaction,
          tenantId,
          input,
        );
        await this.repository.recordConnectionAudit(transaction, {
          actorId: context.actorId,
          requestId: context.requestId,
          tenantId,
          accountId: account.id,
        });
        return account;
      });
    } catch (error) {
      if (isUnique(error))
        throw new ConflictException("This WhatsApp phone number is already connected.");
      throw error;
    }
  }

  async syncAccount(context: AuthorizationContext, accountId: string) {
    const tenantId = requireTenant(context);
    const account = await this.repository.findAccountForProvider(tenantId, accountId);
    if (account === undefined) throw new NotFoundException("WhatsApp account not found.");
    if (account.status === "DISCONNECTED" || account.credentialStatus !== "ACTIVE") {
      throw new ApplicationError({
        code: "WHATSAPP_ACCOUNT_NOT_CONNECTED",
        message: "The WhatsApp account is disconnected or its credential is inactive.",
        statusCode: HttpStatus.CONFLICT,
      });
    }
    try {
      // Provider work is deliberately outside the following persistence transaction.
      const result = await this.provider.syncAccount({
        accountId: account.id,
        credentialReference: account.credentialReference,
        phoneNumberId: account.phoneNumberId,
        wabaId: account.wabaId,
      });
      return await this.transactions.execute(async (transaction) => {
        const saved = await this.repository.applySync(transaction, tenantId, accountId, result);
        if (saved === undefined) throw new NotFoundException("WhatsApp account not found.");
        await this.repository.recordAccountAudit(transaction, {
          accountId,
          action: "WHATSAPP_ACCOUNT_SYNCED",
          actorId: context.actorId,
          requestId: context.requestId,
          tenantId,
        });
        return saved;
      });
    } catch (error) {
      if (error instanceof WhatsAppProviderError) {
        await this.transactions.execute((transaction) =>
          this.repository.recordProviderFailure(
            transaction,
            tenantId,
            accountId,
            error.providerCode === "AUTHENTICATION" || error.providerCode === "AUTHORIZATION"
              ? "AUTH_FAILED"
              : "DEGRADED",
          ),
        );
      }
      throw error;
    }
  }

  async disconnectAccount(context: AuthorizationContext, accountId: string) {
    const tenantId = requireTenant(context);
    return this.transactions.execute(async (transaction) => {
      const account = await this.repository.disconnectAccount(transaction, tenantId, accountId);
      if (account === undefined) throw new NotFoundException("WhatsApp account not found.");
      await this.repository.recordAccountAudit(transaction, {
        accountId,
        action: "WHATSAPP_ACCOUNT_DISCONNECTED",
        actorId: context.actorId,
        requestId: context.requestId,
        tenantId,
      });
      return { disconnected: true, id: account.id };
    });
  }
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function requireTenant(context: AuthorizationContext): string {
  if (context.tenantId !== null) return context.tenantId;
  throw new ApplicationError({
    code: "FORBIDDEN",
    message: "Tenant access is required.",
    statusCode: HttpStatus.FORBIDDEN,
  });
}
