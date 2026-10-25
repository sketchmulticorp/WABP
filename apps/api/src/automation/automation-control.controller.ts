import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { object, revision } from "./automation.dto.js";
import { AutomationControlService } from "./automation-control.service.js";

@Controller("automations")
export class AutomationControlController {
  constructor(private readonly service: AutomationControlService) {}
  @Post(":id/pause")
  @HttpCode(200)
  @TenantContent("automation.read", "automation.publish")
  pause(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.flow(
      context,
      id,
      revision(object(body, ["expectedRevision"]).expectedRevision),
      "pause",
    );
  }
  @Post(":id/reactivate")
  @HttpCode(200)
  @TenantContent("automation.read", "automation.publish")
  reactivate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.flow(
      context,
      id,
      revision(object(body, ["expectedRevision"]).expectedRevision),
      "reactivate",
    );
  }
}
@Controller("conversations")
export class ConversationAutomationController {
  constructor(private readonly service: AutomationControlService) {}
  @Get(":id/automation")
  @TenantContent("conversation.read")
  status(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.status(context, id);
  }
  @Post(":id/automation/takeover")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.reply")
  takeover(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    object(body ?? {}, []);
    return this.service.conversation(context, id, "takeover");
  }
  @Post(":id/automation/allow")
  @HttpCode(200)
  @TenantContent("conversation.read", "conversation.reply")
  allow(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    object(body ?? {}, []);
    return this.service.conversation(context, id, "allow");
  }
}
