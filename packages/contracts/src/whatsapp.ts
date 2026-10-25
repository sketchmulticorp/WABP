/** Safe connection-method state, never a credential or assertion of Meta approval. */
export interface WhatsAppOnboardingState {
  readonly mode: "development" | "embedded_signup";
  readonly connection_available: boolean;
  readonly status: "DEVELOPMENT_ONLY" | "NOT_CONFIGURED" | "READY_TO_CONNECT";
}

export interface WhatsAppSignupAttempt {
  readonly attemptId: string;
  readonly nonce: string;
  readonly appId: string;
  readonly configurationId: string;
  readonly graphApiVersion: string;
  readonly expiresInSeconds: number;
}
