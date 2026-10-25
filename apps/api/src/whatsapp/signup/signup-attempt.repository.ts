import { Inject, Injectable } from "@nestjs/common";
import type { AppRedis } from "../../redis/redis.client.js";
import { REDIS_CLIENT } from "../../redis/redis.constants.js";

/** Ephemeral one-use state only; neither OAuth codes nor tokens are stored in Redis. */
@Injectable()
export class SignupAttemptRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: AppRedis) {}
  async create(key: string, bindingHash: string): Promise<boolean> {
    return (await this.redis.set(key, bindingHash, "EX", 600, "NX")) === "OK";
  }
  async consume(key: string, bindingHash: string): Promise<boolean> {
    return (
      Number(
        await this.redis.eval(
          "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('DEL',KEYS[1]); return 1 end; return 0",
          1,
          key,
          bindingHash,
        ),
      ) === 1
    );
  }
}
