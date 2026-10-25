import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";

import { TenantScopeService } from "./authorization.service.js";
import type { AuthenticatedRequest } from "./authorization.types.js";

@Injectable()
export class TenantContentGuard implements CanActivate {
  constructor(private readonly tenantScope: TenantScopeService) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const context = request.authContext;
    if (context === undefined) {
      return false;
    }
    this.tenantScope.requireTenantContext(context);
    return true;
  }
}
