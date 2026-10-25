import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ConversationCollaborationService } from "./conversation-collaboration.service.js";
import {
  parseConversationAssignment,
  parseConversationNote,
} from "./conversation-collaboration.dto.js";
import { parseInboxQuery } from "./conversation.dto.js";

/** Transport adapter for internal team operations; never submits customer messages. */
@Controller("conversations")
export class ConversationCollaborationController {
  constructor(private readonly service: ConversationCollaborationService) {}
  @Post(":id/assign")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.assign")
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.assign(context, id, parseConversationAssignment(body));
  }
  @Get(":id/notes")
  @TenantContent("conversation.read")
  notes(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.listNotes(context, id, parseInboxQuery(query, true));
  }
  @Post(":id/notes")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.reply")
  createNote(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.createNote(context, id, parseConversationNote(body));
  }
}
