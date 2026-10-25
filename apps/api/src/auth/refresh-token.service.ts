import { createHmac, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { AUTH_CONFIG } from "./auth.constants.js";
import type { AuthModuleConfig } from "./auth.types.js";

@Injectable()
export class RefreshTokenService {
  private readonly pepper: Buffer;

  constructor(@Inject(AUTH_CONFIG) config: AuthModuleConfig) {
    this.pepper = Buffer.from(config.refreshPepper, "utf8");
  }

  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  digest(token: string): string {
    return createHmac("sha256", this.pepper).update(token, "utf8").digest("base64url");
  }
}
