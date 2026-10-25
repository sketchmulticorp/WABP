import { randomUUID } from "node:crypto";
import type { ProviderCredentialCipher } from "@whatsapp-platform/whatsapp-provider";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { ApplicationError } from "../../common/errors/application-error.js";
import type { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import type { ProviderCredentialRepository } from "./provider-credential.repository.js";

/** Internal signup use case. Caller must verify Meta token/assets before invoking; no HTTP route. */
export class ProviderCredentialPersistenceService {
  constructor(
    private readonly repository: ProviderCredentialRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly cipher: ProviderCredentialCipher,
  ) {}

  async storeVerifiedToken(
    context: AuthorizationContext,
    accountId: string,
    token: string,
    transaction?: AppDatabaseTransaction,
  ) {
    const tenantId = context.tenantId;
    if (
      !tenantId ||
      context.isPlatformActor ||
      context.roleSystemKey !== "TENANT_ADMIN" ||
      !context.permissions.has("whatsapp.connect")
    )
      throw new ApplicationError({
        code: "FORBIDDEN",
        message: "Tenant Admin access is required.",
        statusCode: 403,
      });
    // Signup can supply its transaction so account, credential and audit commit together.
    const persist = async (transaction: AppDatabaseTransaction) => {
      const account = await this.repository.lockAccount(transaction, tenantId, accountId);
      if (!account)
        throw new ApplicationError({
          code: "WHATSAPP_ACCOUNT_NOT_FOUND",
          message: "WhatsApp account not found.",
          statusCode: 404,
        });
      const id = account.credentialId ?? randomUUID();
      const binding = { id, tenantId, accountId };
      const encryptedToken = this.cipher.encrypt(token, binding);
      const saved = await this.repository.saveEncrypted(transaction, {
        ...binding,
        encryptedToken,
      });
      if (!saved)
        throw new ApplicationError({
          code: "WHATSAPP_CREDENTIAL_CONFLICT",
          message: "The connection changed. Retry onboarding.",
          statusCode: 409,
        });
      await this.repository.recordReplacementAudit(transaction, {
        tenantId,
        accountId,
        actorId: context.actorId,
        requestId: context.requestId,
      });
      return { accountId, credentialId: id };
    };
    return transaction ? persist(transaction) : this.transactions.execute(persist);
  }
}
