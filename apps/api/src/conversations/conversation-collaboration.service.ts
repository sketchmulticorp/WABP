import { Injectable } from "@nestjs/common";
import type {
  ConversationAssignmentResponse,
  ConversationNotesResponse,
  ConversationNoteCreateResponse,
} from "@whatsapp-platform/contracts";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { ContactRepository } from "../contacts/contact.repository.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { ConversationRepository } from "./conversation.repository.js";
import { ConversationNoteRepository } from "./conversation-note.repository.js";
import { inboxCursor, type InboxPage } from "./conversation.dto.js";
import type { CreateConversationNoteInput } from "./conversation-collaboration.dto.js";

/** Internal teamwork only: no messaging/provider dependency or implicit human handoff. */
@Injectable()
export class ConversationCollaborationService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly notes: ConversationNoteRepository,
    private readonly contacts: ContactRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly scope: TenantScopeService,
  ) {}
  async assignees(context: AuthorizationContext, page: InboxPage) {
    const tenantId = this.tenant(context, "conversation.assign");
    const rows = await this.contacts.listActiveTenantAssignees(tenantId, page);
    const entries = rows.slice(0, page.limit),
      last = entries.at(-1);
    return {
      assignees: entries.map((row) => ({ id: row.id, displayName: row.displayName })),
      nextCursor:
        rows.length > page.limit && last !== undefined ? inboxCursor(last.at, last.id) : null,
    };
  }
  async assign(
    context: AuthorizationContext,
    id: string,
    assignedUserId: string | null,
  ): Promise<ConversationAssignmentResponse> {
    const tenantId = this.tenant(context, "conversation.assign");
    return this.transactions.execute(async (tx) => {
      const conversation = await this.conversations.find(tenantId, id, tx);
      if (conversation === undefined) throw missing();
      if (
        assignedUserId !== null &&
        !(await this.contacts.isActiveTenantAssignee(tx, tenantId, assignedUserId))
      )
        throw new ApplicationError({
          code: "CONVERSATION_ASSIGNEE_INVALID",
          message: "Choose an active member of this business.",
          statusCode: 400,
        });
      if (conversation.assignedUserId !== assignedUserId) {
        await this.conversations.assign(tx, tenantId, conversation.id, assignedUserId);
        await this.conversations.audit(
          tx,
          context,
          tenantId,
          conversation.id,
          "CONVERSATION_ASSIGNED",
          {
            previousAssigneeId: conversation.assignedUserId,
            assignedUserId,
          },
        );
      }
      return { conversationId: conversation.id, assignedUserId };
    });
  }
  async listNotes(
    context: AuthorizationContext,
    id: string,
    page: InboxPage,
  ): Promise<ConversationNotesResponse> {
    const tenantId = this.tenant(context);
    const conversation = await this.conversations.find(tenantId, id);
    if (conversation === undefined) throw missing();
    const rows = await this.notes.list(tenantId, conversation.id, page);
    const notes = rows.slice(0, page.limit),
      last = notes.at(-1);
    return {
      notes,
      nextCursor:
        rows.length > page.limit && last !== undefined
          ? inboxCursor(last.createdAt, last.id)
          : null,
    };
  }
  async createNote(
    context: AuthorizationContext,
    id: string,
    input: CreateConversationNoteInput,
  ): Promise<ConversationNoteCreateResponse> {
    const tenantId = this.tenant(context, "conversation.reply");
    return this.transactions.execute(async (tx) => {
      const conversation = await this.conversations.find(tenantId, id, tx);
      if (conversation === undefined) throw missing();
      // The existing primary key is the retry identity; no extra idempotency table is needed.
      const created = await this.notes.create(
        tx,
        tenantId,
        conversation.id,
        context.actorId,
        input,
      );
      if (created !== undefined) {
        await this.conversations.audit(
          tx,
          context,
          tenantId,
          conversation.id,
          "CONVERSATION_NOTE_ADDED",
          { noteId: created.id },
        );
        return { note: created, idempotent: false };
      }
      const existing = await this.notes.find(tx, tenantId, conversation.id, input.id);
      if (existing?.authorId !== context.actorId || existing.note !== input.note)
        throw new ApplicationError({
          code: "CONVERSATION_NOTE_ID_CONFLICT",
          message: "This note identifier cannot be reused for this request.",
          statusCode: 409,
        });
      return { note: existing, idempotent: true };
    });
  }
  private tenant(context: AuthorizationContext, writePermission?: string): string {
    const tenant = this.scope.requireTenantContext(context);
    if (
      !tenant.permissions.has("conversation.read") ||
      (writePermission !== undefined && !tenant.permissions.has(writePermission))
    )
      throw forbiddenError();
    return tenant.tenantId;
  }
}
function missing() {
  return new ApplicationError({
    code: "CONVERSATION_NOT_FOUND",
    message: "Conversation not found.",
    statusCode: 404,
  });
}
