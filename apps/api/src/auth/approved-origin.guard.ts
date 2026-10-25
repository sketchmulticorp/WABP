import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import { AUTH_CONFIG } from "./auth.constants.js";
import type { AuthModuleConfig } from "./auth.types.js";

interface OriginRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

@Injectable()
export class ApprovedOriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(@Inject(AUTH_CONFIG) config: AuthModuleConfig) {
    this.allowedOrigins = new Set(config.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OriginRequest>();
    const origin = request.headers.origin;
    if (origin === undefined) {
      return true;
    }
    if (typeof origin !== "string" || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException("The request origin is not allowed.");
    }
    return true;
  }
}
