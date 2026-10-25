import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";

import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { parseChangeTenantUserStatusInput, parseCreateTenantUserInput } from "./user.dto.js";
import { UserService } from "./user.service.js";

/** Tenant account transport only; tenant scope and role policy stay in the service. */
@Controller("users")
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get()
  @TenantContent("user.read")
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.list(context);
  }

  @Post()
  @TenantContent("user.invite")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.create(context, parseCreateTenantUserInput(body));
  }

  @Patch(":userId/status")
  @TenantContent("user.update")
  changeStatus(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Body() body: unknown,
  ) {
    return this.service.changeStatus(context, userId, parseChangeTenantUserStatusInput(body));
  }

  @Delete(":userId")
  @TenantContent("user.deactivate")
  remove(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
  ) {
    return this.service.remove(context, userId);
  }
}
