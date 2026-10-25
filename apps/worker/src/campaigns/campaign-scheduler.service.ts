import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
} from "@nestjs/common";
import { CampaignExecutionService } from "@whatsapp-platform/api/campaign-runtime";
import { PinoLogger } from "nestjs-pino";
import { CAMPAIGN_SCHEDULER_ENABLED } from "./campaign-scheduler.constants.js";

/** Thin worker timer: durable state and all campaign decisions live in application services. */
@Injectable()
export class CampaignSchedulerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private inFlight: Promise<void> | undefined;
  constructor(
    private readonly execution: CampaignExecutionService,
    @Inject(CAMPAIGN_SCHEDULER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignSchedulerService.name);
  }
  onApplicationBootstrap() {
    if (!this.enabled) return;
    const start = () => {
      if (!this.running && !this.stopping) this.inFlight = this.tick();
    };
    start();
    this.timer = setInterval(start, 1000);
    this.timer.unref();
  }
  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      for (const candidate of await this.execution.candidates()) {
        await this.execution.advance(candidate.tenantId, candidate.id);
      }
    } catch {
      this.logger.warn(
        { event: "campaign_scheduler_retry" },
        "Campaign work will retry from durable state",
      );
    } finally {
      this.running = false;
    }
  }
  async beforeApplicationShutdown() {
    this.stopping = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.inFlight;
  }
}
