import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Res,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import {
  Authenticated,
  CurrentAuthorization,
} from "../../authorization/authorization.decorators.js";
import { ALLOW_PASSWORD_CHANGE } from "../../authorization/authorization.constants.js";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { ApprovedOriginGuard } from "../approved-origin.guard.js";
import { AUTH_CONFIG } from "../auth.constants.js";
import type { AuthModuleConfig } from "../auth.types.js";
import { buildExpiredRefreshCookie } from "../auth-cookie.js";
import { ApplicationError } from "../../common/errors/application-error.js";
import { PasswordChangeError, type PasswordChangeErrorCode } from "./password-change.error.js";
import { parsePasswordChangeInput } from "./password-change.dto.js";
import { PasswordChangeService } from "./password-change.service.js";

const statuses: Readonly<Record<PasswordChangeErrorCode, number>> = {
  PASSWORD_CHANGE_NOT_REQUIRED: 409,
  CURRENT_PASSWORD_INVALID: 403,
  NEW_PASSWORD_REUSED: 400,
  PASSWORD_CHANGE_SESSION_INVALID: 401,
  PASSWORD_CHANGE_RATE_LIMITED: 429,
  PASSWORD_CHANGE_UNAVAILABLE: 503,
};

const messages: Readonly<Record<PasswordChangeErrorCode, string>> = {
  PASSWORD_CHANGE_NOT_REQUIRED: "No initial password change is required. Sign in again.",
  CURRENT_PASSWORD_INVALID: "The temporary password is incorrect.",
  NEW_PASSWORD_REUSED: "Choose a password different from your temporary password.",
  PASSWORD_CHANGE_SESSION_INVALID: "Your session is no longer active. Sign in again.",
  PASSWORD_CHANGE_RATE_LIMITED: "Too many password-change attempts. Try again later.",
  PASSWORD_CHANGE_UNAVAILABLE: "Password change is temporarily unavailable. Try again.",
};

@Controller("auth")
@UseGuards(ApprovedOriginGuard)
export class PasswordChangeController {
  constructor(
    private readonly service: PasswordChangeService,
    @Inject(AUTH_CONFIG) private readonly config: AuthModuleConfig,
  ) {}

  @Post("change-password")
  @HttpCode(200)
  @Authenticated()
  async changeOwn(
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<{ password_changed: true; login_required: true }> {
    const input = parsePasswordChangeInput(body);
    try {
      await this.service.changeOwn(context, input);
    } catch (error: unknown) {
      if (!(error instanceof PasswordChangeError)) throw error;
      throw new ApplicationError({
        code: error.code,
        statusCode: statuses[error.code],
        message:
          error.code === "CURRENT_PASSWORD_INVALID"
            ? "The current password is incorrect."
            : error.code === "NEW_PASSWORD_REUSED"
              ? "Choose a password different from your current password."
              : messages[error.code],
        retryable: error.code === "PASSWORD_CHANGE_UNAVAILABLE",
      });
    }
    response.setHeader("Set-Cookie", buildExpiredRefreshCookie(this.config.cookieSecure));
    return { password_changed: true, login_required: true };
  }

  @Post("change-initial-password")
  @HttpCode(200)
  @Authenticated()
  @SetMetadata(ALLOW_PASSWORD_CHANGE, true)
  async complete(
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<{ password_changed: true; login_required: true }> {
    const input = parsePasswordChangeInput(body);
    try {
      await this.service.complete(context, input);
    } catch (error: unknown) {
      if (!(error instanceof PasswordChangeError)) throw error;
      throw new ApplicationError({
        code: error.code,
        statusCode: statuses[error.code],
        message: messages[error.code],
        retryable: error.code === "PASSWORD_CHANGE_UNAVAILABLE",
      });
    }
    response.setHeader("Set-Cookie", buildExpiredRefreshCookie(this.config.cookieSecure));
    return { password_changed: true, login_required: true };
  }
}
