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
import {
  parseCampaignCursor,
  parseCampaignInput,
  parseUpdateCampaignInput,
} from "./campaign.dto.js";
import { CampaignService } from "./campaign.service.js";
import { BadRequestException } from "@nestjs/common";
import { CampaignLifecycleService, type CampaignAction } from "./campaign-lifecycle.service.js";
import { parseCampaignCommand } from "./campaign.dto.js";

/** Transport-only boundary: tenant identity never comes from the draft payload. */
@Controller("campaigns")
export class CampaignController {
  constructor(
    private readonly service: CampaignService,
    private readonly lifecycle: CampaignLifecycleService,
  ) {}
  @Get()
  @TenantContent("campaign.read")
  list(@CurrentAuthorization() context: AuthorizationContext, @Query("cursor") cursor: unknown) {
    return this.service.list(context, parseCampaignCursor(cursor));
  }
  @Get("draft-options")
  @TenantContent("campaign.read")
  options(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.options(context);
  }
  @Get(":id")
  @TenantContent("campaign.read")
  read(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.read(context, id);
  }
  @Post(":id/preflight")
  @HttpCode(202)
  @TenantContent("campaign.write")
  preflight(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.preflight(context, id);
  }
  @Get(":id/preflight/latest")
  @TenantContent("campaign.read")
  latestPreflight(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.preflightStatus(context, id);
  }
  @Get(":id/preflight/:runId")
  @TenantContent("campaign.read")
  preflightStatus(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("runId", new ParseUUIDPipe({ version: "4" })) runId: string,
  ) {
    return this.service.preflightStatus(context, id, runId);
  }
  @Post()
  @TenantContent("campaign.write")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.create(context, parseCampaignInput(body));
  }
  @Get(":id/report")
  @TenantContent("campaign.read")
  report(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("cursor") cursor: unknown,
  ) {
    return this.lifecycle.report(context, id, parseCampaignCursor(cursor));
  }
  @Post(":id/:action")
  @HttpCode(200)
  @TenantContent("campaign.read")
  command(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    if (
      ![
        "request-approval",
        "approve",
        "reject",
        "send",
        "schedule",
        "pause",
        "resume",
        "cancel",
      ].includes(action)
    )
      throw new BadRequestException("Unknown campaign action.");
    return this.lifecycle.command(
      context,
      id,
      action as CampaignAction,
      parseCampaignCommand(body, action === "reject", action === "send" || action === "schedule"),
    );
  }
  @Patch(":id")
  @TenantContent("campaign.write")
  update(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(context, id, parseUpdateCampaignInput(body));
  }
}
