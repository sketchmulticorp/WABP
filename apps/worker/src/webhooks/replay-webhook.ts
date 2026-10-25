import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";

import { WorkerModule } from "../worker.module.js";
import { WebhookEventService } from "./webhook-event.service.js";

const eventId = process.argv[2];

if (eventId === undefined || !isUuid(eventId)) {
  process.stderr.write(
    "Usage: pnpm --filter @whatsapp-platform/worker webhook:replay <webhook-event-uuid>\n",
  );
  process.exitCode = 1;
} else {
  const app = await NestFactory.createApplicationContext(
    // Replay changes state only; it must not also start a consumer in this CLI process.
    WorkerModule.register(loadRuntimeConfig(), {
      startWebhookProcessing: false,
      startMessageProcessing: false,
      startMessageRelay: false,
      startContactImportProcessing: false,
      startAutomationProcessing: false,
      startCampaignPreflightProcessing: false,
    }),
    {
      logger: false,
    },
  );
  try {
    const replayed = await app.get(WebhookEventService).replay(eventId);
    process.stdout.write(
      replayed ? "Webhook event queued for replay.\n" : "Webhook event is not replayable.\n",
    );
    if (!replayed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
