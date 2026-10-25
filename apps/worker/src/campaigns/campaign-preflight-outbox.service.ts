import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PinoLogger } from "nestjs-pino";
import { CAMPAIGN_PREFLIGHT_WORKER_ENABLED } from "./campaign-preflight.constants.js";
import { CampaignPreflightOutboxRepository } from "./campaign-preflight-outbox.repository.js";
import { CampaignPreflightQueue } from "./campaign-preflight.queue.js";

@Injectable()
export class CampaignPreflightOutboxService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly workerId = `campaign-preflight-relay:${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  constructor(
    private readonly repository: CampaignPreflightOutboxRepository,
    private readonly queue: CampaignPreflightQueue,
    @Inject(CAMPAIGN_PREFLIGHT_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignPreflightOutboxService.name);
  }
  onApplicationBootstrap() {
    if (!this.enabled) return;
    void this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), 1_000);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.queue.close();
  }
  async dispatch() {
    try {
      for (;;) {
        const event = await this.repository.claimNext(this.workerId);
        if (event === undefined) return;
        try {
          await this.queue.enqueue(event.preflightRunId);
          await this.repository.publish(event.id, this.workerId);
        } catch {
          await this.repository.fail(event.id, this.workerId);
          return;
        }
      }
    } catch {
      this.logger.error(
        { event: "campaign_preflight_relay_failed" },
        "Campaign preflight relay failed safely",
      );
    }
  }
}
