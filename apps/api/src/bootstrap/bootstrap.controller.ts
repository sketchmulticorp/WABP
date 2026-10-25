import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApprovedOriginGuard } from "../auth/approved-origin.guard.js";
import type { RequestWithId } from "../common/http/request-id.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { BootstrapError, type BootstrapErrorCode } from "./bootstrap.error.js";
import { parseBootstrapInput } from "./bootstrap.dto.js";
import { BootstrapService } from "./bootstrap.service.js";
import type { FirstSuperAdminResult } from "./bootstrap.types.js";

const errorStatuses: Readonly<Record<BootstrapErrorCode, number>> = {
  BOOTSTRAP_DISABLED: 403,
  BOOTSTRAP_DENIED: 403,
  BOOTSTRAP_CLOSED: 409,
  BOOTSTRAP_CATALOG_CONFLICT: 409,
  BOOTSTRAP_RATE_LIMITED: 429,
  BOOTSTRAP_UNAVAILABLE: 503,
};

/** HTTP transport for owner-controlled initialization; never issues login tokens. */
@Controller("bootstrap")
@UseGuards(ApprovedOriginGuard)
export class BootstrapController {
  constructor(private readonly service: BootstrapService) {}

  @Post("super-admin")
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Headers("x-bootstrap-secret") secret: string | undefined,
    @Req() request: RequestWithId,
  ): Promise<FirstSuperAdminResult> {
    const input = parseBootstrapInput(body);
    try {
      return await this.service.createFirstSuperAdmin(input, secret, request.id);
    } catch (error: unknown) {
      if (!(error instanceof BootstrapError)) throw error;
      throw new ApplicationError({
        code: error.code,
        statusCode: errorStatuses[error.code],
        message: "Super Admin initialization could not be completed.",
        retryable: error.code === "BOOTSTRAP_UNAVAILABLE",
      });
    }
  }
}
