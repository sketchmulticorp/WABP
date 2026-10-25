import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { REQUIRED_PERMISSIONS } from "./authorization.constants.js";
import { forbiddenError } from "./authorization.service.js";
import type { AuthenticatedRequest } from "./authorization.types.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      REQUIRED_PERMISSIONS,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    if (required === undefined || required.length === 0) {
      return true;
    }
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const context = request.authContext;
    if (context === undefined || required.some((key) => !context.permissions.has(key))) {
      throw forbiddenError();
    }
    return true;
  }
}
