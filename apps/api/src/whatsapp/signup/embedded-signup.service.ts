import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { WhatsAppSignupAttempt } from "@whatsapp-platform/contracts";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { LoginRateLimiterAdapter } from "../../auth/login-rate-limiter.adapter.js";
import { ApplicationError } from "../../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import { ProviderCredentialPersistenceService } from "../credentials/provider-credential-persistence.service.js";
import {
  WHATSAPP_ONBOARDING_CONFIG,
  WhatsAppOnboardingService,
  type OnboardingConfig,
} from "../whatsapp-onboarding.service.js";
import { SignupAttemptRepository } from "./signup-attempt.repository.js";
import { MetaEmbeddedSignupAdapter } from "./meta-embedded-signup.adapter.js";
import { EmbeddedSignupRepository } from "./embedded-signup.repository.js";
import type { SignupCompletion } from "./embedded-signup.dto.js";

/** Coordinates one-use local state, external verification, then one atomic business write. */
@Injectable()
export class EmbeddedSignupService {
  constructor(
    @Inject(WHATSAPP_ONBOARDING_CONFIG) private readonly config: OnboardingConfig,
    private readonly policy: WhatsAppOnboardingService,
    private readonly attempts: SignupAttemptRepository,
    private readonly limiter: LoginRateLimiterAdapter,
    private readonly provider: MetaEmbeddedSignupAdapter,
    private readonly repository: EmbeddedSignupRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly credentials: ProviderCredentialPersistenceService,
  ) {}

  async start(context: AuthorizationContext): Promise<WhatsAppSignupAttempt> {
    this.authorize(context);
    await this.rateLimit(context);
    const attemptId = randomUUID(),
      nonce = randomBytes(32).toString("base64url");
    try {
      if (!(await this.attempts.create(this.key(attemptId), this.binding(context, nonce))))
        throw unavailable();
    } catch {
      throw unavailable();
    }
    return {
      attemptId,
      nonce,
      appId: this.config.meta?.appId ?? "",
      configurationId: this.config.whatsappOnboarding?.configurationId ?? "",
      graphApiVersion: this.config.meta?.graphApiVersion ?? "",
      expiresInSeconds: 600,
    };
  }

  async complete(context: AuthorizationContext, input: SignupCompletion) {
    const tenantId = this.authorize(context);
    await this.rateLimit(context);
    let claimed: boolean;
    try {
      claimed = await this.attempts.consume(
        this.key(input.attemptId),
        this.binding(context, input.nonce),
      );
    } catch {
      throw unavailable();
    }
    if (!claimed)
      throw new ApplicationError({
        code: "WHATSAPP_SIGNUP_ATTEMPT_INVALID",
        message: "Signup expired or was already used. Refresh accounts, then restart if needed.",
        statusCode: 409,
      });
    // Consumed even on timeout/failure: never retry an exchangeable code ambiguously.
    const verified = await this.provider.exchangeAndVerify(
      input.code,
      input.wabaId,
      input.phoneNumberId,
    );
    try {
      return await this.transactions.execute(async (transaction) => {
        const account = await this.repository.connect(transaction, tenantId, verified);
        if (!account)
          throw new ApplicationError({
            code: "WHATSAPP_CONNECTION_CONFLICT",
            message: "These WhatsApp assets cannot be connected to this business.",
            statusCode: 409,
          });
        await this.credentials.storeVerifiedToken(context, account.id, verified.token, transaction);
        return { accountId: account.id, connected: true, messagingActivationPerformed: false };
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      // Drizzle errors may contain query parameters: never forward their message/cause.
      throw unavailable();
    }
  }

  private authorize(context: AuthorizationContext): string {
    if (
      context.isPlatformActor ||
      !context.tenantId ||
      context.roleSystemKey !== "TENANT_ADMIN" ||
      !context.permissions.has("whatsapp.connect")
    )
      throw new ApplicationError({
        code: "FORBIDDEN",
        message: "Tenant Admin access is required.",
        statusCode: 403,
      });
    const state = this.policy.describe(context);
    if (state.mode !== "embedded_signup" || !state.connection_available) throw unavailable();
    return context.tenantId;
  }
  private async rateLimit(context: AuthorizationContext) {
    try {
      const result = await this.limiter.consume(
        `signup:${context.actorId}`,
        `signup:${context.actorId}`,
      );
      if (!result.allowed)
        throw new ApplicationError({
          code: "WHATSAPP_SIGNUP_RATE_LIMITED",
          message: "Too many signup attempts. Try again later.",
          statusCode: 429,
        });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw unavailable();
    }
  }
  private key(id: string) {
    return `${this.config.queuePrefix ?? "whatsapp-saas"}:whatsapp-signup:${id}`;
  }
  private binding(context: AuthorizationContext, nonce: string) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          context.actorId,
          context.sessionId,
          context.tenantId,
          nonce,
          this.config.whatsappOnboarding?.mode,
          this.config.whatsappOnboarding?.configurationId,
          this.config.meta?.appId,
          this.config.meta?.graphApiVersion,
          this.config.credentialEncryption?.activeKeyId,
        ]),
      )
      .digest("hex");
  }
}
function unavailable() {
  return new ApplicationError({
    code: "WHATSAPP_SIGNUP_UNAVAILABLE",
    message:
      "WhatsApp signup is unavailable. Refresh accounts and retry when configuration is ready.",
    statusCode: 503,
  });
}
