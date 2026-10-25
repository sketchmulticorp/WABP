import { Inject, Injectable } from "@nestjs/common";
import { SERVICE_NAMES } from "@whatsapp-platform/config";
import type { LivenessStatus, ReadinessStatus } from "@whatsapp-platform/contracts";

import { HealthRepository } from "./health.repository.js";
import { RedisHealthAdapter } from "./redis-health.adapter.js";

export interface DatabaseHealthReader {
  pingDatabase(): Promise<void>;
}

export interface RedisHealthReader {
  ping(): Promise<void>;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(HealthRepository) private readonly healthRepository: DatabaseHealthReader,
    @Inject(RedisHealthAdapter) private readonly redisHealth: RedisHealthReader,
  ) {}

  getLiveness(): LivenessStatus {
    return {
      service: SERVICE_NAMES.api,
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    const [database, redis] = await Promise.all([
      this.check(() => this.healthRepository.pingDatabase()),
      this.check(() => this.redisHealth.ping()),
    ]);
    return this.buildReadiness(database, redis);
  }

  private buildReadiness(
    database: ReadinessStatus["checks"]["database"],
    redis: ReadinessStatus["checks"]["redis"],
  ): ReadinessStatus {
    return {
      checks: { configuration: "up", database, redis },
      service: SERVICE_NAMES.api,
      status: database === "up" && redis === "up" ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
    };
  }

  private async check(operation: () => Promise<void>): Promise<"down" | "up"> {
    try {
      await operation();
      return "up";
    } catch {
      return "down";
    }
  }
}
