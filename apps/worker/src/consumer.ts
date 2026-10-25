import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Logger } from "nestjs-pino";
import { WorkerModule } from "./worker.module.js";

/** Deployment entry point: consumers/relays only; the campaign timer has its own singleton service. */
async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(config, {
      startCampaignScheduling: false,
      exposeHealth: true,
    }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
void bootstrap();
