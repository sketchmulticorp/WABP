export interface PreflightContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly campaignId: string;
  readonly requestedBy: string;
  readonly requestId: string;
  readonly contentVersion: number;
  readonly currentContentVersion: number;
  readonly campaignStatus: string;
  readonly pinnedTemplateVersion?: number | null;
  readonly campaignStartedAt?: string | null;
  readonly campaignApprovalStatus: string;
  readonly campaignApprovedVersion: number | null;
  readonly audienceDefinition: unknown;
  readonly variableMapping: unknown;
  readonly tenantStatus: string;
  readonly accountStatus: string;
  readonly credentialStatus: string | null;
  readonly templateProviderStatus: string;
  readonly templateApprovalStatus: string;
  readonly templateContentVersion: number;
  readonly templateApprovedVersion: number | null;
  readonly templateComponents: unknown;
  readonly subscriptionStatus: string | null;
  readonly planStatus: string | null;
  readonly planLimits: unknown;
  readonly monthlyUsed: number;
}

export interface PreflightContact {
  readonly id: string;
  readonly phoneE164: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly consentStatus: string;
  readonly selectionCount: number;
}

export interface RecipientSnapshot {
  readonly contactId: string;
  readonly status: "PENDING" | "SKIPPED";
  readonly renderedVariables: Readonly<Record<string, string>>;
  readonly skipOrErrorCode: string | null;
}
