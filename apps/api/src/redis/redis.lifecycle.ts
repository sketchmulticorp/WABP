import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";

import type { AppRedis } from "./redis.client.js";
import { REDIS_CLIENT } from "./redis.constants.js";

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: AppRedis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === "end") {
      return;
    }
    if (this.redis.status === "wait") {
      this.redis.disconnect(false);
      return;
    }

    await this.redis.quit();
  }
}
