import { Redis } from "ioredis";

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

export type AppRedis = Redis;
