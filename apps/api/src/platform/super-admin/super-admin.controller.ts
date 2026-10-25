import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { CreateSuperAdminResponse } from "@whatsapp-platform/contracts";
import {
  CurrentAuthorization,
  RequirePermissions,
} from "../../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { ApprovedOriginGuard } from "../../auth/approved-origin.guard.js";
import { ApplicationError } from "../../common/errors/application-error.js";
import { parseCreateAccountInput } from "../../users/user.dto.js";
import { SuperAdminError, type SuperAdminErrorCode } from "./super-admin.error.js";
import { SuperAdminService } from "./super-admin.service.js";

const failures: Record<SuperAdminErrorCode, { status: number; message: string }> = {
  SUPER_ADMIN_FORBIDDEN: {
    status: 403,
    message: "Only an active Super Admin can create another Super Admin.",
  },
  SUPER_ADMIN_EMAIL_UNAVAILABLE: {
    status: 409,
    message: "This email is unavailable. No existing account was changed.",
  },
  SUPER_ADMIN_RATE_LIMITED: {
    status: 429,
    message: "Too many account creation attempts. Try again later.",
  },
  SUPER_ADMIN_CREATE_UNAVAILABLE: {
    status: 503,
    message:
      "Super Admin creation is temporarily unavailable. Check whether the account was created before retrying.",
  },
};

@Controller("platform/super-admins")
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions("user.invite")
  @UseGuards(ApprovedOriginGuard)
  async create(
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ): Promise<CreateSuperAdminResponse> {
    const input = parseCreateAccountInput(body);
    try {
      return await this.service.create(context, input);
    } catch (error: unknown) {
      if (!(error instanceof SuperAdminError)) throw error;
      throw new ApplicationError({
        code: error.code,
        statusCode: failures[error.code].status,
        message: failures[error.code].message,
        retryable: error.code === "SUPER_ADMIN_CREATE_UNAVAILABLE",
      });
    }
  }
}
