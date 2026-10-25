import { Inject, Injectable } from "@nestjs/common";
import { WebhookQueue } from "../webhooks/webhook.queue.js";
import { WorkerHealthRepository } from "./worker-health.repository.js";

export const PROCESS_HEALTH_NAME = Symbol("PROCESS_HEALTH_NAME");
/** Bounded shared probes avoid one database/Redis request per concurrent health caller. */
@Injectable()
export class WorkerHealthService {
  private inFlight: Promise<boolean> | null = null;
  constructor(
    private readonly repository: WorkerHealthRepository,
    private readonly queue: WebhookQueue,
    @Inject(PROCESS_HEALTH_NAME) readonly serviceName: string,
  ) {}
  ready(): Promise<boolean> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = Promise.all([
      this.probe(() => this.repository.ping()),
      this.probe(() => this.queue.ping()),
    ])
      .then((checks) => checks.every(Boolean))
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
  private async probe(operation: () => Promise<void>): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation().then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => {
            resolve(false);
          }, 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
