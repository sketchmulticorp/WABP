import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";

import type { SystemPermissionKey } from "../database/seed/seed.catalog.js";
import { AccessTokenGuard } from "./access-token.guard.js";
import { REQUIRED_PERMISSIONS, TENANT_CONTENT_ROUTE } from "./authorization.constants.js";
import { PermissionGuard } from "./permission.guard.js";
import { TenantContentGuard } from "./tenant-content.guard.js";
import type { AuthenticatedRequest, AuthorizationContext } from "./authorization.types.js";

export function Authenticated(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(AccessTokenGuard));
}

export function RequirePermissions(
  ...permissionKeys: readonly SystemPermissionKey[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, Object.freeze([...permissionKeys])),
    UseGuards(AccessTokenGuard, PermissionGuard),
  );
}

export function TenantContent(
  ...permissionKeys: readonly SystemPermissionKey[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(TENANT_CONTENT_ROUTE, true),
    SetMetadata(REQUIRED_PERMISSIONS, Object.freeze([...permissionKeys])),
    UseGuards(AccessTokenGuard, TenantContentGuard, PermissionGuard),
  );
}

export const CurrentAuthorization = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): AuthorizationContext => {
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.authContext === undefined) {
      throw new Error("Authenticated route is missing its authorization context.");
    }
    return request.authContext;
  },
);
