import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { parseDevelopmentConnectionInput } from "./whatsapp.dto.js";
import { WhatsAppService } from "./whatsapp.service.js";
import { WhatsAppOnboardingService } from "./whatsapp-onboarding.service.js";
import { EmbeddedSignupService } from "./signup/embedded-signup.service.js";
import { parseSignupCompletion } from "./signup/embedded-signup.dto.js";
@Controller("whatsapp")
export class WhatsAppController {
  constructor(
    private readonly service: WhatsAppService,
    private readonly onboarding: WhatsAppOnboardingService,
    private readonly signup: EmbeddedSignupService,
  ) {}

  @Post("onboarding/start")
  @TenantContent("whatsapp.connect")
  startSignup(@CurrentAuthorization() context: AuthorizationContext) {
    return this.signup.start(context);
  }

  @Post("onboarding/complete")
  @TenantContent("whatsapp.connect")
  completeSignup(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.signup.complete(context, parseSignupCompletion(body));
  }

  @Get("onboarding")
  @TenantContent("whatsapp.read")
  onboardingConfiguration(@CurrentAuthorization() context: AuthorizationContext) {
    return this.onboarding.describe(context);
  }

  /** HTTP adapter for development asset mapping; no provider token is accepted or returned. */
  @Post("connect")
  @TenantContent("whatsapp.connect")
  connect(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.connectDevelopmentAccount(context, parseDevelopmentConnectionInput(body));
  }

  @Get("accounts")
  @TenantContent("whatsapp.read")
  listAccounts(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.listAccounts(context);
  }

  @Post("accounts/:accountId/sync")
  @TenantContent("whatsapp.sync")
  sync(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("accountId", new ParseUUIDPipe({ version: "4" })) accountId: string,
  ) {
    return this.service.syncAccount(context, accountId);
  }

  @Delete("accounts/:accountId")
  @HttpCode(HttpStatus.OK)
  @TenantContent("whatsapp.disconnect")
  disconnect(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("accountId", new ParseUUIDPipe({ version: "4" })) accountId: string,
  ) {
    return this.service.disconnectAccount(context, accountId);
  }
}
