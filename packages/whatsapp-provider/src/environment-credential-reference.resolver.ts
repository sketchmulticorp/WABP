import { WhatsAppProviderError } from "./whatsapp-provider.error.js";

const DEVELOPMENT_TOKEN_REFERENCE = "env://META_DEVELOPMENT_ACCESS_TOKEN";

/** Resolves only the approved local development credential reference. */
export class EnvironmentCredentialReferenceResolver {
  constructor(private readonly developmentAccessToken: string | undefined) {}

  resolve(reference: string): string {
    if (reference !== DEVELOPMENT_TOKEN_REFERENCE) {
      throw new WhatsAppProviderError(
        "CONFIGURATION",
        "The WhatsApp credential reference is not available in this environment.",
      );
    }
    if (this.developmentAccessToken === undefined) {
      throw new WhatsAppProviderError(
        "CONFIGURATION",
        "The Meta development access token is not configured.",
      );
    }
    return this.developmentAccessToken;
  }
}
