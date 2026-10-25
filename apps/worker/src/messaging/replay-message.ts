import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { WorkerModule } from "../worker.module.js";
import { MessageDeliveryService } from "./message-delivery.service.js";

const tenantId = process.argv[2];
const messageId = process.argv[3];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
if (
  tenantId === undefined ||
  messageId === undefined ||
  !uuid.test(tenantId) ||
  !uuid.test(messageId)
) {
  process.stderr.write("Usage: message:replay <tenant-uuid> <message-uuid>\n");
  process.exitCode = 1;
} else {
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(loadRuntimeConfig(), {
      startMessageProcessing: false,
      startMessageRelay: false,
      startWebhookProcessing: false,
      startContactImportProcessing: false,
      startAutomationProcessing: false,
      startCampaignPreflightProcessing: false,
    }),
    { logger: false },
  );
  try {
    const replayed = await app.get(MessageDeliveryService).replay(tenantId, messageId);
    process.stdout.write(
      replayed ? "Message queued for replay.\n" : "Message is not replayable.\n",
    );
    if (!replayed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
