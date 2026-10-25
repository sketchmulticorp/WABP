import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ConversationService } from "./conversation.service.js";
import { parseInboxCommand, parseInboxQuery } from "./conversation.dto.js";
import { ConversationReplyService } from "./conversation-reply.service.js";
import { parseConversationReply } from "./conversation-reply.dto.js";
import { ConversationCollaborationService } from "./conversation-collaboration.service.js";

/** HTTP adapter only. All identity, workflow and persistence decisions remain server-side. */
@Controller("conversations")
export class ConversationController {
  constructor(
    private readonly service: ConversationService,
    private readonly replies: ConversationReplyService,
    private readonly collaboration: ConversationCollaborationService,
  ) {}
  // Static route must precede /:id so 'assignees' is never parsed as a UUID.
  @Get("assignees")
  @TenantContent("conversation.read", "conversation.assign")
  assignees(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.collaboration.assignees(context, parseInboxQuery(query, true));
  }
  @Post(":id/messages")
  @HttpCode(202)
  @TenantContent("conversation.read", "conversation.reply")
  reply(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.replies.reply(context, id, parseConversationReply(body));
  }
  @Get()
  @TenantContent("conversation.read")
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(context, parseInboxQuery(query));
  }
  @Get(":id")
  @TenantContent("conversation.read")
  history(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.history(context, id, parseInboxQuery(query, true));
  }
  @Post(":id/read")
  @HttpCode(200)
  @TenantContent("conversation.read")
  read(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.command(context, id, "read", parseInboxCommand(body, true));
  }
  @Post(":id/unread")
  @HttpCode(200)
  @TenantContent("conversation.read")
  unread(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.command(context, id, "unread", parseInboxCommand(body));
  }
  @Post(":id/close")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.close")
  close(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.command(context, id, "close", parseInboxCommand(body));
  }
  @Post(":id/reopen")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.close")
  reopen(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.command(context, id, "reopen", parseInboxCommand(body));
  }
}
