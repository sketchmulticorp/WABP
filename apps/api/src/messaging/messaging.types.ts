export type OutboundMessageSource = "AUTOMATION" | "CAMPAIGN" | "INBOX";
import type { InteractiveMessageContent } from "@whatsapp-platform/whatsapp-provider";
export interface OutboundInteractiveContent extends InteractiveMessageContent {
  readonly type: "INTERACTIVE";
}

export interface OutboundTextContent {
  readonly text: string;
  readonly type: "TEXT";
}

export interface OutboundTemplateContent {
  readonly templateId: string;
  readonly type: "TEMPLATE";
  readonly variables: Readonly<Record<string, string>>;
}

export interface CreateOutboundMessageInput {
  readonly campaignId?: string;
  readonly clientMessageKey: string;
  readonly contactId: string;
  readonly content: OutboundTemplateContent | OutboundTextContent | OutboundInteractiveContent;
  readonly automation?: {
    readonly runId: string;
    readonly versionId: string;
    readonly nodeKey: string;
    readonly publisherId: string;
  };
  readonly conversationId: string;
  readonly source: OutboundMessageSource;
  readonly whatsappAccountId: string;
}

export interface OutboundPolicySnapshot {
  readonly accountCredentialStatus: string | null;
  readonly accountStatus: string;
  readonly contactConsentStatus: string;
  readonly conversationWindowExpiresAt: string | null;
  readonly planLimits: unknown;
  readonly planStatus: string | null;
  readonly subscriptionStatus: string | null;
  readonly tenantStatus: string;
}

export interface OutboundTemplateSnapshot {
  readonly approvalStatus: string;
  readonly approvedVersion: number | null;
  readonly category: string;
  readonly components: unknown;
  readonly contentVersion: number;
  readonly id: string;
  readonly language: string;
  readonly name: string;
  readonly providerStatus: string;
}

export interface OutboundMessageRecord {
  readonly clientMessageKey: string | null;
  readonly errorCode: string | null;
  readonly id: string;
  readonly messageType: string;
  readonly policyDecision: unknown;
  readonly status: string;
}

export interface OutboundPolicyDecision {
  readonly automation?: CreateOutboundMessageInput["automation"];
  readonly outcome: "ALLOWED" | "BLOCKED";
  readonly source: OutboundMessageSource;
  readonly version: 1;
  readonly requestFingerprint: string;
  readonly campaign?: { readonly contentVersion: number; readonly templateContentVersion: number };
  readonly blockCode?: string;
  readonly quota?: {
    readonly limit: number;
    readonly periodEnd: string;
    readonly periodStart: string;
    readonly usedBefore: number;
  };
  readonly template?: {
    readonly approvalStatus: string;
    readonly approvedVersion: number | null;
    readonly contentVersion: number;
    readonly providerStatus: string;
    readonly templateId: string;
  };
}
