import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Logger } from "nestjs-pino";
import { SchedulerModule } from "./scheduler.module.js";

/** Railway must run exactly one instance; this process does not deliver provider messages. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    SchedulerModule.register(loadRuntimeConfig()),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
void bootstrap();
