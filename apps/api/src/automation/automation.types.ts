import type { AutomationSummary, AutomationVersion } from "@whatsapp-platform/contracts";

/** Versioned internal JSON contract stored in the existing trigger_config column. */
export interface AutomationTrigger {
  readonly schemaVersion: 1;
  readonly accountId: string;
  readonly keywords: readonly string[];
  readonly publishedBy: string | null;
}
export interface StoredAutomationVersion extends AutomationVersion {
  readonly publishedBy: string | null;
}
export interface AutomationRecord extends AutomationSummary {
  readonly versions: readonly StoredAutomationVersion[];
}
export type RunStatus =
  "RUNNING" | "WAITING" | "PAUSED" | "HANDED_OFF" | "COMPLETED" | "FAILED" | "CANCELLED";
export interface AutomationRunState {
  readonly schemaVersion: 1;
  readonly reason: string | null;
  readonly visited: readonly string[];
  readonly waitingMessageId: string | null;
  readonly expiresAt: string | null;
}
export interface AutomationRun {
  readonly id: string;
  readonly tenantId: string;
  readonly flowVersionId: string;
  readonly conversationId: string;
  readonly currentNodeId: string | null;
  readonly status: RunStatus;
  readonly state: AutomationRunState;
  readonly lastEventKey: string | null;
  readonly lockVersion: number;
}
export interface AutomationConversation {
  readonly id: string;
  readonly contactId: string;
  readonly accountId: string;
  readonly status: string;
  readonly automationState: string;
  readonly windowExpiresAt: string | null;
  readonly consentStatus: string;
}
