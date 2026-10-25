import { Controller, Get } from "@nestjs/common";
import type { ServiceDescriptor } from "@whatsapp-platform/contracts";
import { SERVICE_NAMES } from "@whatsapp-platform/config";

@Controller()
export class AppController {
  @Get()
  describeService(): ServiceDescriptor {
    return {
      name: SERVICE_NAMES.api,
      status: "initialized",
      version: "0.1.0",
    };
  }
}
