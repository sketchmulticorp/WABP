/** Draft definitions only: audience expansion and delivery belong to later workflows. */
export interface CampaignAudience {
  readonly version: 1;
  readonly contactIds: readonly string[];
  readonly groupIds: readonly string[];
}

export type CampaignVariable =
  | { readonly source: "LITERAL"; readonly value: string }
  | { readonly source: "CONTACT_FIELD"; readonly field: "name" | "email" | "phone_e164" };

export interface CampaignDraftInput {
  readonly name: string;
  readonly description: string | null;
  readonly whatsappAccountId: string;
  readonly templateId: string;
  readonly audienceDefinition: CampaignAudience;
  readonly variableMapping: Readonly<Record<string, CampaignVariable>>;
  readonly scheduleAt?: string | null;
  readonly scheduleTimezone?: string;
}

export interface CampaignDraft extends CampaignDraftInput {
  readonly revision: string;
  readonly id: string;
  readonly status: string;
  readonly contentVersion: number;
  readonly approvalStatus: string;
  readonly approvedVersion: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly templateContentVersion?: number | null;
  readonly approvalRequestedBy?: string | null;
  readonly approvalRejectionReason?: string | null;
  readonly pauseReason?: string | null;
}

export interface CampaignReport {
  readonly finalPreflight: {
    readonly status: string;
    readonly blockers: readonly string[];
    readonly errorCode: string | null;
  } | null;
  readonly campaign: CampaignDraft;
  readonly counts: readonly { readonly status: string; readonly count: number }[];
  readonly recipients: readonly {
    readonly id: string;
    readonly contactId: string;
    readonly status: string;
    readonly reason: string | null;
    readonly messageId: string | null;
  }[];
  readonly nextCursor: string | null;
  readonly asOf: string;
}

export interface CampaignPage {
  readonly campaigns: readonly CampaignDraft[];
  readonly nextCursor: string | null;
}

export interface CampaignDraftOptions {
  readonly accounts: readonly {
    readonly id: string;
    readonly displayPhoneNumber: string | null;
    readonly status: string;
  }[];
  readonly templates: readonly {
    readonly id: string;
    readonly whatsappAccountId: string;
    readonly name: string;
    readonly language: string;
    readonly providerStatus: string;
    readonly approvalStatus: string;
    readonly components: unknown;
  }[];
  readonly groups: readonly { readonly id: string; readonly name: string }[];
}

export type CampaignPreflightStatus =
  "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "SUPERSEDED";

export interface CampaignPreflightEstimates {
  readonly selectedContacts: number;
  readonly groupMemberships: number;
  readonly duplicateSelections: number;
  readonly resolvedRecipients: number;
  readonly eligibleRecipients: number;
  readonly skippedRecipients: number;
  readonly skippedByReason: Readonly<Record<string, number>>;
  readonly monthlyLimit: number;
  readonly monthlyUsed: number;
  readonly monthlyRemaining: number;
  readonly estimatedUsage: number;
  readonly remainingAfterSend: number;
}

export interface CampaignPreflightRun {
  readonly id: string;
  readonly campaignId: string;
  readonly contentVersion: number;
  readonly status: CampaignPreflightStatus;
  readonly blockers: readonly string[];
  readonly estimates: CampaignPreflightEstimates | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}
