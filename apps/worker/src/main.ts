import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { SERVICE_NAMES } from "@whatsapp-platform/config";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Logger, PinoLogger } from "nestjs-pino";

import { WorkerModule } from "./worker.module.js";

async function bootstrap(): Promise<void> {
  // Workers must reject invalid shared infrastructure and secret configuration before consuming jobs.
  const config = loadRuntimeConfig();
  const app = await NestFactory.createApplicationContext(WorkerModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // PinoLogger is scoped; standalone bootstrap must resolve rather than statically get it.
  const logger = await app.resolve(PinoLogger);
  logger.setContext(SERVICE_NAMES.worker);
  logger.info({ event: "worker_initialized" }, "Worker application context initialized");
  app.enableShutdownHooks();
}

void bootstrap();
