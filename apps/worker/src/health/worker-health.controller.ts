import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import { WorkerHealthService } from "./worker-health.service.js";

/** Transport-only private health listener; a standalone worker needs no HTTP framework dependency. */
@Injectable()
export class WorkerHealthController implements OnApplicationBootstrap, OnApplicationShutdown {
  private stopping = false;
  private readonly server = createServer((request, response) => {
    void this.handle(request, response).catch(() => {
      if (!response.headersSent) this.respond(response, 503, "not_ready");
      else response.end();
    });
  });
  constructor(
    private readonly service: WorkerHealthService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {
    this.server.requestTimeout = 10_000;
    this.server.headersTimeout = 10_000;
    this.server.keepAliveTimeout = 1_000;
  }
  async onApplicationBootstrap(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.http.port, "0.0.0.0", resolve);
    });
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (
      request.method !== "GET" ||
      (request.url !== "/health/live" && request.url !== "/health/ready")
    ) {
      this.respond(response, 404, "not_found");
      return;
    }
    if (this.stopping) {
      this.respond(response, 503, "not_ready");
      return;
    }
    const ready = request.url === "/health/live" || (await this.service.ready());
    this.respond(response, ready ? 200 : 503, ready ? "ok" : "not_ready");
  }
  private respond(response: ServerResponse, status: number, result: string): void {
    response.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(JSON.stringify({ service: this.service.serviceName, status: result }));
  }
}
