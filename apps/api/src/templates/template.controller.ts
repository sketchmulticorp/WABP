import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";

import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  parseCreateTemplateInput,
  parseExpectedContentVersion,
  parseRejectTemplateInput,
  parseSyncTemplatesInput,
  parseUpdateTemplateInput,
} from "./template.dto.js";
import { TemplateService } from "./template.service.js";

/** HTTP-only adapter for tenant template work; policy lives in TemplateService. */
@Controller("templates")
export class TemplateController {
  constructor(private readonly service: TemplateService) {}

  @Get()
  @TenantContent("template.read")
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.list(context);
  }

  @Post()
  @TenantContent("template.write")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.create(context, parseCreateTemplateInput(body));
  }

  @Patch(":templateId")
  @TenantContent("template.write")
  update(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(context, templateId, parseUpdateTemplateInput(body));
  }

  @Post("sync")
  @TenantContent("template.sync")
  sync(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.sync(context, parseSyncTemplatesInput(body).whatsappAccountId);
  }

  @Post(":templateId/request-approval")
  @TenantContent("template.write")
  requestApproval(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string,
    @Body() body: unknown,
  ) {
    return this.service.requestApproval(context, templateId, parseExpectedContentVersion(body));
  }

  @Post(":templateId/approve")
  @TenantContent("template.approve")
  approve(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string,
    @Body() body: unknown,
  ) {
    return this.service.approve(context, templateId, parseExpectedContentVersion(body));
  }

  @Post(":templateId/reject")
  @TenantContent("template.approve")
  reject(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string,
    @Body() body: unknown,
  ) {
    const input = parseRejectTemplateInput(body);
    return this.service.reject(context, templateId, input.expectedContentVersion, input.reason);
  }

  @Get(":templateId/preview")
  @TenantContent("template.read")
  preview(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string,
  ) {
    return this.service.preview(context, templateId);
  }
}
