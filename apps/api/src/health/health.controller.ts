import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { LivenessStatus, ReadinessStatus } from "@whatsapp-platform/contracts";

import { HealthService } from "./health.service.js";

interface StatusResponse {
  status(code: number): unknown;
}

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  liveness(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  async readiness(@Res({ passthrough: true }) response: StatusResponse): Promise<ReadinessStatus> {
    const readiness = await this.healthService.getReadiness();
    if (readiness.status === "not_ready") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return readiness;
  }
}
