import { Inject, Injectable } from "@nestjs/common";
import type { ApiRuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { WhatsAppOnboardingState } from "@whatsapp-platform/contracts";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";

export const WHATSAPP_ONBOARDING_CONFIG = Symbol("WHATSAPP_ONBOARDING_CONFIG");
export type OnboardingConfig = Pick<
  ApiRuntimeConfig,
  "whatsappOnboarding" | "meta" | "credentialEncryption"
> & { readonly queuePrefix?: string };

/** Connection-method policy only; never interprets configuration as Meta approval. */
@Injectable()
export class WhatsAppOnboardingService {
  constructor(@Inject(WHATSAPP_ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  describe(context: AuthorizationContext): WhatsAppOnboardingState {
    this.requireTenant(context);
    const mode = this.config.whatsappOnboarding?.mode ?? "development";
    const configured = Boolean(
      this.config.whatsappOnboarding?.configurationId &&
      this.config.meta?.appId &&
      this.config.meta.graphApiVersion &&
      this.config.meta.appSecret,
      // Credential storage must be configured before accepting an exchangeable code.
    );
    const storageConfigured = Boolean(
      this.config.credentialEncryption?.activeKeyId &&
      this.config.credentialEncryption.keys?.[this.config.credentialEncryption.activeKeyId],
    );
    return {
      mode,
      connection_available: mode === "development" || (configured && storageConfigured),
      status:
        mode === "development"
          ? ("DEVELOPMENT_ONLY" as const)
          : configured && storageConfigured
            ? ("READY_TO_CONNECT" as const)
            : ("NOT_CONFIGURED" as const),
    };
  }

  requireDevelopmentConnection(context: AuthorizationContext): void {
    this.requireTenant(context);
    if ((this.config.whatsappOnboarding?.mode ?? "development") !== "development")
      throw new ApplicationError({
        code: "WHATSAPP_ONBOARDING_UNAVAILABLE",
        message: "Manual development connection is disabled in this onboarding mode.",
        statusCode: 409,
      });
  }

  private requireTenant(context: AuthorizationContext): void {
    if (context.isPlatformActor || context.tenantId === null)
      throw new ApplicationError({
        code: "FORBIDDEN",
        message: "Tenant access is required.",
        statusCode: 403,
      });
  }
}
