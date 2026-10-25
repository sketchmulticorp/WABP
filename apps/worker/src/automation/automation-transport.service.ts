import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PinoLogger } from "nestjs-pino";
import {
  AutomationTriggerService,
  AutomationExecutionService,
} from "@whatsapp-platform/api/automation-runtime";
import {
  AutomationOutboxRepository,
  type AutomationEvent,
} from "./automation-outbox.repository.js";
import { AUTOMATION_ENABLED, AutomationQueue } from "./automation-queue.adapter.js";
import { AutomationTransactionManager } from "./automation-transaction.manager.js";

/** Transport orchestration only; the API runtime services own trigger/node business behavior. */
@Injectable()
export class AutomationTransportService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workerId = `automation-relay:${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private inFlight: Promise<void> | undefined;
  constructor(
    private readonly repository: AutomationOutboxRepository,
    private readonly queue: AutomationQueue,
    private readonly triggers: AutomationTriggerService,
    private readonly execution: AutomationExecutionService,
    @Inject(AUTOMATION_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
    private readonly transactions: AutomationTransactionManager,
  ) {}
  onApplicationBootstrap() {
    if (!this.enabled) return;
    const start = () => {
      if (!this.stopping && !this.running) this.inFlight = this.dispatch();
    };
    start();
    this.timer = setInterval(start, 1000);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.inFlight;
    await this.queue.close();
  }
  async dispatch() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      for (let count = 0; count < 100; count++) {
        const event = await this.repository.claim(this.workerId);
        if (event === undefined) return;
        try {
          await this.queue.enqueue(event);
          await this.repository.published(event.eventId, this.workerId);
        } catch {
          await this.repository.failedPublication(event.eventId, this.workerId);
          return;
        }
      }
    } catch {
      this.logger.warn(
        { event: "automation_relay_retry" },
        "Automation handoff will retry from durable state",
      );
    } finally {
      this.running = false;
    }
  }
  async process(event: AutomationEvent) {
    const persisted = await this.repository.find(event.eventId);
    if (persisted?.kind !== event.kind || persisted.targetId !== event.targetId)
      throw new Error("AUTOMATION_EVENT_MISMATCH");
    return persisted.kind === "inbound"
      ? this.triggers.inbound(persisted.targetId)
      : this.execution.advance(persisted.targetId, persisted.eventId);
  }
  async exhausted(event: AutomationEvent) {
    const persisted = await this.repository.find(event.eventId);
    if (persisted?.kind !== event.kind || persisted.targetId !== event.targetId) return;
    await this.repository.exhausted(persisted.eventId);
    if (persisted.kind === "advance") await this.execution.fail(persisted.targetId);
  }
  replay(id: string) {
    return this.transactions.execute(async (session) => {
      const original = await this.repository.lockFailed(session, id);
      if (original === undefined) return null;
      const replacement = await this.repository.copyEvent(session, id);
      await this.repository.markReplayed(session, id);
      await this.repository.auditReplay(session, original.tenant_id, id, replacement);
      return replacement;
    });
  }
}
