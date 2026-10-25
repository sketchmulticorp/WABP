import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { loadApiRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Logger } from "nestjs-pino";
import { configureAutomationBodyParser } from "./automation/automation-http.config.js";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  // Validate once before NestJS creates providers so startup never proceeds with partial config.
  const config = loadApiRuntimeConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bufferLogs: true,
    // Meta signs the original bytes, so the webhook service must receive them unmodified.
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  // CLAR-039: graph payloads may exceed Express's default 100 KB. This parser is scoped
  // to automation; Meta webhook bytes still use Nest's original raw-body parser below.
  if (config.deploymentMode !== "preview") configureAutomationBodyParser(app);
  // Express trusts forwarded client IPs only when the deployment explicitly configures proxy hops.
  app.set("trust proxy", config.http.trustProxyHops);
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { method: RequestMethod.GET, path: "health/live" },
      { method: RequestMethod.GET, path: "health/ready" },
    ],
  });
  app.enableCors({ credentials: true, origin: [...config.http.corsAllowedOrigins] });

  await app.listen(config.http.port, "0.0.0.0");
}

void bootstrap();
