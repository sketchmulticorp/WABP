import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";

import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  parseCreateGroupInput,
  parseGroupMembersInput,
  parseUpdateGroupInput,
} from "./group.dto.js";
import { GroupService } from "./group.service.js";

/** HTTP-only adapter for static tenant Groups and their Contact memberships. */
@Controller("groups")
export class GroupController {
  constructor(private readonly service: GroupService) {}

  @Get()
  @TenantContent("contact.read")
  list(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.list(context);
  }

  @Post()
  @TenantContent("contact.write")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.create(context, parseCreateGroupInput(body));
  }

  @Patch(":groupId")
  @TenantContent("contact.write")
  update(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(context, groupId, parseUpdateGroupInput(body));
  }

  @Delete(":groupId")
  @TenantContent("contact.delete")
  remove(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
  ) {
    return this.service.remove(context, groupId);
  }

  @Get(":groupId/members")
  @TenantContent("contact.read")
  listMembers(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
  ) {
    return this.service.listMembers(context, groupId);
  }

  @Post(":groupId/members")
  @TenantContent("contact.write")
  addMembers(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @Body() body: unknown,
  ) {
    return this.service.addMembers(context, groupId, parseGroupMembersInput(body));
  }

  @Delete(":groupId/members/:contactId")
  @TenantContent("contact.delete")
  removeMember(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @Param("contactId", new ParseUUIDPipe({ version: "4" })) contactId: string,
  ) {
    return this.service.removeMember(context, groupId, contactId);
  }
}
