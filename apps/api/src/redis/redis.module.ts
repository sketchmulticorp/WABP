import { type DynamicModule, Global, Module, type Provider } from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

import { createRedisClient } from "./redis.client.js";
import { REDIS_CLIENT } from "./redis.constants.js";
import { RedisLifecycle } from "./redis.lifecycle.js";

@Global()
@Module({})
export class RedisModule {
  static register(config: RuntimeConfig["redis"]): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: () => createRedisClient(config.url),
    };

    return {
      global: true,
      module: RedisModule,
      providers: [redisProvider, RedisLifecycle],
      exports: [REDIS_CLIENT],
    };
  }
}
