import { Inject, Injectable } from "@nestjs/common";

import type { AppRedis } from "../redis/redis.client.js";
import { REDIS_CLIENT } from "../redis/redis.constants.js";

@Injectable()
export class RedisHealthAdapter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: AppRedis) {}

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
