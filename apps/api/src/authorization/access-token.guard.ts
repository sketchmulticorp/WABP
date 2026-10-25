import { type CanActivate, type ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ALLOW_PASSWORD_CHANGE } from "./authorization.constants.js";

import { AuthorizationService } from "./authorization.service.js";
import type { AuthenticatedRequest } from "./authorization.types.js";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    request.authContext = await this.authorizationService.authenticate(
      request.headers.authorization,
      request.id,
      this.reflector?.get<boolean>(ALLOW_PASSWORD_CHANGE, executionContext.getHandler()) === true,
    );
    return true;
  }
}
