import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { ConversationReplyResponse } from "@whatsapp-platform/contracts";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { ConversationRepository } from "./conversation.repository.js";
import type { ConversationReplyInput } from "./conversation-reply.dto.js";

/** Derives trusted targets, then delegates policy, quota, persistence and queueing once. */
@Injectable()
export class ConversationReplyService {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly messaging: MessagingService,
    private readonly scope: TenantScopeService,
  ) {}
  async reply(
    context: AuthorizationContext,
    id: string,
    input: ConversationReplyInput,
  ): Promise<ConversationReplyResponse> {
    const tenant = this.scope.requireTenantContext(context);
    if (
      !tenant.permissions.has("conversation.read") ||
      !tenant.permissions.has("conversation.reply")
    )
      throw forbiddenError();
    const conversation = await this.repository.find(tenant.tenantId, id);
    if (conversation === undefined)
      throw new ApplicationError({
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
        statusCode: 404,
      });
    // Actor + endpoint namespace isolates keys; the composer's fingerprint detects target/content reuse.
    const key = createHash("sha256")
      .update(JSON.stringify([context.actorId, input.clientMessageKey]))
      .digest("hex");
    return this.messaging.createOutboundMessage(context, {
      clientMessageKey: `inbox:${key}`,
      conversationId: id,
      contactId: conversation.contactId,
      whatsappAccountId: conversation.whatsappAccountId,
      content: input.content,
      source: "INBOX",
    });
  }
}
