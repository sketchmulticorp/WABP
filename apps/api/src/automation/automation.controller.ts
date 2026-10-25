import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { AutomationService } from "./automation.service.js";
import {
  object,
  parseDraft,
  parseSimulation,
  revision,
  automationInvalid,
} from "./automation.dto.js";
import { uuidPattern } from "./automation.validation.js";

/** HTTP-only entry point. Authorization/workflows live in services and SQL in repositories. */
@Controller("automations")
export class AutomationController {
  constructor(private readonly service: AutomationService) {}
  @Get("options")
  @TenantContent("automation.read")
  options(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() raw: Record<string, unknown>,
  ) {
    const query = object(raw, ["accountCursor", "memberCursor"]);
    for (const value of Object.values(query))
      if (typeof value !== "string" || !uuidPattern.test(value))
        automationInvalid("Invalid option cursor.");
    return this.service.options(
      context,
      typeof query.accountCursor === "string" ? query.accountCursor : null,
      typeof query.memberCursor === "string" ? query.memberCursor : null,
    );
  }
  @Get()
  @TenantContent("automation.read")
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() raw: Record<string, unknown>,
  ) {
    const query = object(raw, ["cursor"]);
    if (
      query.cursor !== undefined &&
      (typeof query.cursor !== "string" || !uuidPattern.test(query.cursor))
    )
      automationInvalid("Invalid cursor.");
    return this.service.list(context, typeof query.cursor === "string" ? query.cursor : null);
  }
  @Get(":id")
  @TenantContent("automation.read")
  read(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.read(context, id);
  }
  @Post()
  @TenantContent("automation.read", "automation.write")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    const input = parseDraft(body, false);
    return this.service.save(context, null, input, null);
  }
  @Patch(":id")
  @TenantContent("automation.read", "automation.write")
  update(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    const input = parseDraft(body, true);
    return this.service.save(context, id, input, input.expectedRevision);
  }
  @Post(":id/test")
  @HttpCode(200)
  @TenantContent("automation.read", "automation.test")
  simulate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    const input = parseSimulation(body);
    return this.service.simulate(context, id, input.expectedRevision, input.selections);
  }
  @Post(":id/publish")
  @HttpCode(200)
  @TenantContent("automation.read", "automation.publish")
  publish(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    const input = object(body, ["expectedRevision"]);
    return this.service.publish(context, id, revision(input.expectedRevision));
  }
}
