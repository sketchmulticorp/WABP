import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { AuthTokenResponse, LogoutResponse } from "@whatsapp-platform/contracts";
import type { IncomingHttpHeaders } from "node:http";

import type { RequestWithId } from "../common/http/request-id.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import { buildExpiredRefreshCookie, buildRefreshCookie, readRefreshCookie } from "./auth-cookie.js";
import { parseLoginInput } from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import type { AuthModuleConfig, AuthRequestContext } from "./auth.types.js";
import { ApprovedOriginGuard } from "./approved-origin.guard.js";
import { Inject } from "@nestjs/common";

interface AuthenticationRequest extends RequestWithId {
  readonly headers: IncomingHttpHeaders;
  readonly ip?: string;
}

interface CookieResponse {
  setHeader(name: string, value: string): void;
}

@Controller("auth")
@UseGuards(ApprovedOriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthModuleConfig,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticationRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AuthTokenResponse> {
    const authenticated = await this.authService.login(
      parseLoginInput(body),
      requestContext(request),
    );
    response.setHeader(
      "Set-Cookie",
      buildRefreshCookie({
        expiresAt: authenticated.refreshTokenExpiresAt,
        secure: this.config.cookieSecure,
        token: authenticated.refreshToken,
      }),
    );
    return tokenResponse(authenticated.accessToken, authenticated.accessTokenExpiresIn);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: AuthenticationRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AuthTokenResponse> {
    const authenticated = await this.authService.refresh(
      readRefreshCookie(request.headers.cookie),
      requestContext(request),
    );
    response.setHeader(
      "Set-Cookie",
      buildRefreshCookie({
        expiresAt: authenticated.refreshTokenExpiresAt,
        secure: this.config.cookieSecure,
        token: authenticated.refreshToken,
      }),
    );
    return tokenResponse(authenticated.accessToken, authenticated.accessTokenExpiresIn);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticationRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<LogoutResponse> {
    await this.authService.logout(
      readRefreshCookie(request.headers.cookie),
      requestContext(request),
    );
    response.setHeader("Set-Cookie", buildExpiredRefreshCookie(this.config.cookieSecure));
    return { logged_out: true };
  }
}

function requestContext(request: AuthenticationRequest): AuthRequestContext {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
    requestId: request.id,
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 1_024) : null,
  };
}

function tokenResponse(accessToken: string, expiresIn: number): AuthTokenResponse {
  return { access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" };
}
