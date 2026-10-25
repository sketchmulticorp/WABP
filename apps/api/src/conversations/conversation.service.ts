import { Injectable } from "@nestjs/common";
import type { ConversationSummary } from "@whatsapp-platform/contracts";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { ConversationRepository } from "./conversation.repository.js";
import { inboxCursor, type InboxFilters, type InboxPage } from "./conversation.dto.js";

export type ConversationAction = "read" | "unread" | "close" | "reopen";

/** Shared inbox use cases only; no provider calls or outbound-send behavior here. */
@Injectable()
export class ConversationService {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly scope: TenantScopeService,
  ) {}
  async list(context: AuthorizationContext, input: InboxFilters) {
    const tenantId = this.tenant(context);
    const rows = await this.repository.list(tenantId, input);
    const page = rows.slice(0, input.limit),
      last = page.at(-1);
    return {
      conversations: page.map(summary),
      nextCursor:
        rows.length > input.limit && last !== undefined ? inboxCursor(last.sortAt, last.id) : null,
    };
  }
  async history(context: AuthorizationContext, id: string, input: InboxPage) {
    const tenantId = this.tenant(context);
    const conversation = await this.repository.find(tenantId, id);
    if (conversation === undefined) throw notFound();
    const rows = await this.repository.history(tenantId, id, input);
    const page = rows.slice(0, input.limit),
      last = page.at(-1);
    return {
      conversation: summary(conversation),
      messages: page,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? inboxCursor(last.createdAt, last.id)
          : null,
    };
  }
  async command(
    context: AuthorizationContext,
    id: string,
    action: ConversationAction,
    lastSeenMessageId: string | null,
  ) {
    const tenantId = this.tenant(context);
    if (
      (action === "close" || action === "reopen") &&
      !context.permissions.has("conversation.close")
    )
      throw forbiddenError();
    return this.transactions.execute(async (tx) => {
      // Inbound unread increments acquire the same Conversation row lock before commit.
      const current = await this.repository.find(tenantId, id, tx);
      if (current === undefined) throw notFound();
      let unreadCount = current.unreadCount,
        status = current.status;
      if (action === "read") {
        const boundary =
          lastSeenMessageId === null
            ? undefined
            : await this.repository.messageBoundary(tx, tenantId, id, lastSeenMessageId);
        if (boundary === undefined)
          throw new ApplicationError({
            code: "CONVERSATION_READ_BOUNDARY_INVALID",
            message: "Choose a message from this conversation.",
            statusCode: 400,
          });
        // Older/retried acknowledgements must never make previously read messages unread.
        unreadCount = Math.min(
          current.unreadCount,
          await this.repository.unreadAfter(tx, tenantId, id, boundary),
        );
      } else if (action === "unread") {
        if ((await this.repository.unreadAfter(tx, tenantId, id, null)) > 0)
          unreadCount = Math.max(1, current.unreadCount);
      } else status = action === "close" ? "CLOSED" : "OPEN";
      if (status !== current.status || unreadCount !== current.unreadCount) {
        await this.repository.update(tx, tenantId, id, { status, unreadCount });
        await this.repository.audit(
          tx,
          context,
          tenantId,
          id,
          `CONVERSATION_${action.toUpperCase()}`,
        );
      }
      return summary({ ...current, status, unreadCount });
    });
  }
  private tenant(context: AuthorizationContext): string {
    const tenant = this.scope.requireTenantContext(context);
    if (!tenant.permissions.has("conversation.read")) throw forbiddenError();
    return tenant.tenantId;
  }
}
function summary(
  row: Awaited<ReturnType<ConversationRepository["list"]>>[number],
): ConversationSummary {
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: row.contactName,
    phoneE164: row.phoneE164,
    consentStatus: row.consentStatus,
    whatsappAccountId: row.whatsappAccountId,
    accountStatus: row.accountStatus,
    assignedUserId: row.assignedUserId,
    status: row.status,
    automationState: row.automationState,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt,
    windowExpiresAt: row.windowExpiresAt,
    serviceWindowOpen: row.windowExpiresAt !== null && Date.parse(row.windowExpiresAt) > Date.now(),
  };
}
function notFound() {
  return new ApplicationError({
    code: "CONVERSATION_NOT_FOUND",
    message: "Conversation not found.",
    statusCode: 404,
  });
}
