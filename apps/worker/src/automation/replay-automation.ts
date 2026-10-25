import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { WorkerModule } from "../worker.module.js";
import { AutomationTransportService } from "./automation-transport.service.js";

const id = process.argv[2];
if (
  id === undefined ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
) {
  process.stderr.write("Usage: automation:replay <failed-outbox-event-uuid>\n");
  process.exitCode = 1;
} else {
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(loadRuntimeConfig(), {
      startAutomationProcessing: false,
      startCampaignPreflightProcessing: false,
      startContactImportProcessing: false,
      startMessageProcessing: false,
      startMessageRelay: false,
      startWebhookProcessing: false,
    }),
    { logger: false },
  );
  try {
    const replacement = await app.get(AutomationTransportService).replay(id);
    process.stdout.write(
      replacement === null ? "Event is not replayable.\n" : "Automation event queued for replay.\n",
    );
    if (replacement === null) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
