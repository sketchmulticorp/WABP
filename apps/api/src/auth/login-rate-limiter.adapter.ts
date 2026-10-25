import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import type { AppRedis } from "../redis/redis.client.js";
import { REDIS_CLIENT } from "../redis/redis.constants.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import type { AuthModuleConfig } from "./auth.types.js";

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

export interface LoginRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

@Injectable()
export class LoginRateLimiterAdapter {
  private readonly windowMilliseconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: AppRedis,
    @Inject(AUTH_CONFIG) private readonly config: AuthModuleConfig,
  ) {
    this.windowMilliseconds = config.loginWindowSeconds * 1_000;
  }

  async consume(email: string, ipAddress: string): Promise<LoginRateLimitResult> {
    const [ipResult, emailResult] = await Promise.all([
      this.increment(this.key("ip", ipAddress), this.config.loginIpLimit),
      this.increment(this.key("email", email), this.config.loginEmailLimit),
    ]);

    return {
      allowed: ipResult.allowed && emailResult.allowed,
      retryAfterSeconds: Math.max(ipResult.retryAfterSeconds, emailResult.retryAfterSeconds),
    };
  }

  async resetEmail(email: string): Promise<void> {
    await this.redis.del(this.key("email", email));
  }

  private async increment(key: string, limit: number): Promise<LoginRateLimitResult> {
    const raw = await this.redis.eval(
      INCREMENT_WITH_EXPIRY_SCRIPT,
      1,
      key,
      this.windowMilliseconds,
    );
    if (!Array.isArray(raw) || raw.length !== 2) {
      throw new Error("Redis returned an invalid authentication rate-limit result.");
    }
    const count = Number(raw[0]);
    const ttlMilliseconds = Number(raw[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttlMilliseconds)) {
      throw new Error("Redis returned a non-numeric authentication rate-limit result.");
    }

    return {
      allowed: count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMilliseconds / 1_000)),
    };
  }

  private key(kind: "email" | "ip", value: string): string {
    const digest = createHmac("sha256", this.config.refreshPepper)
      .update(value, "utf8")
      .digest("base64url");
    return `${this.config.redisKeyPrefix}:auth:login:${kind}:${digest}`;
  }
}
