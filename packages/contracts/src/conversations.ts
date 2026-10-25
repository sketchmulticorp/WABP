/** Tenant-only inbox projections; never include credential or internal policy payloads. */
export interface ConversationNote {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly note: string;
  readonly createdAt: string;
}
export interface ConversationNotesResponse {
  readonly notes: readonly ConversationNote[];
  readonly nextCursor: string | null;
}
export interface ConversationNoteCreateResponse {
  readonly note: ConversationNote;
  readonly idempotent: boolean;
}
export interface ConversationAssignmentResponse {
  readonly conversationId: string;
  readonly assignedUserId: string | null;
}
export interface ConversationReplyResponse {
  readonly id: string;
  readonly idempotent: boolean;
  readonly messageType: string;
  readonly status: string;
}
export interface ConversationSummary {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string | null;
  readonly phoneE164: string;
  readonly consentStatus: string;
  readonly whatsappAccountId: string;
  readonly accountStatus: string;
  readonly assignedUserId: string | null;
  readonly status: string;
  readonly automationState: string;
  readonly unreadCount: number;
  readonly lastMessageAt: string | null;
  readonly windowExpiresAt: string | null;
  readonly serviceWindowOpen: boolean;
}
export interface ConversationMessage {
  readonly id: string;
  readonly direction: string;
  readonly messageType: string;
  readonly status: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly providerCreatedAt: string | null;
  readonly sentAt: string | null;
  readonly deliveredAt: string | null;
  readonly readAt: string | null;
}
export interface ConversationListResponse {
  readonly conversations: readonly ConversationSummary[];
  readonly nextCursor: string | null;
}
export interface ConversationHistoryResponse {
  readonly conversation: ConversationSummary;
  /** Newest stored messages first; render in reverse order for chronological display. */
  readonly messages: readonly ConversationMessage[];
  readonly nextCursor: string | null;
}
