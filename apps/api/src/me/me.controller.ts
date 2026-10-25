import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { ApprovedOriginGuard } from "../auth/approved-origin.guard.js";
import { parseProfileInput } from "./profile.dto.js";
import { ProfileError } from "./profile.error.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { ALLOW_PASSWORD_CHANGE } from "../authorization/authorization.constants.js";
import type {
  CurrentUserResponse,
  RevokeSessionResponse,
  SessionListResponse,
} from "@whatsapp-platform/contracts";

import { Authenticated, CurrentAuthorization } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { MeService } from "./me.service.js";

@Controller("me")
@Authenticated()
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Patch()
  @UseGuards(ApprovedOriginGuard)
  async updateProfile(
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseProfileInput(body);
    try {
      return await this.meService.updateProfile(context, input.displayName);
    } catch (error: unknown) {
      if (!(error instanceof ProfileError)) throw error;
      const unavailable = error.code === "PROFILE_UPDATE_UNAVAILABLE";
      throw new ApplicationError({
        code: error.code,
        statusCode: unavailable ? 503 : 401,
        message: unavailable
          ? "Profile update is temporarily unavailable. Try again."
          : "Your session is no longer active. Sign in again.",
        retryable: unavailable,
      });
    }
  }

  @Get()
  @SetMetadata(ALLOW_PASSWORD_CHANGE, true)
  getCurrentUser(
    @CurrentAuthorization() context: AuthorizationContext,
  ): Promise<CurrentUserResponse> {
    return this.meService.getCurrentUser(context);
  }

  @Get("sessions")
  listSessions(
    @CurrentAuthorization() context: AuthorizationContext,
  ): Promise<SessionListResponse> {
    return this.meService.listSessions(context);
  }

  @Delete("sessions/:sessionId")
  revokeSession(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
  ): Promise<RevokeSessionResponse> {
    return this.meService.revokeSession(context, sessionId);
  }
}
