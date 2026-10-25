import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  parseCreateContactInput,
  parseListContactsInput,
  parseUpdateContactConsentInput,
  parseUpdateContactInput,
} from "./contact.dto.js";
import { ContactService } from "./contact.service.js";

/** HTTP adapter for tenant Contacts; validation and workflow delegation stay explicit here. */
@Controller("contacts")
export class ContactController {
  constructor(private readonly service: ContactService) {}

  @Get()
  @TenantContent("contact.read")
  list(@CurrentAuthorization() context: AuthorizationContext, @Query() query: unknown) {
    return this.service.list(context, parseListContactsInput(query));
  }

  @Post()
  @TenantContent("contact.write")
  create(@CurrentAuthorization() context: AuthorizationContext, @Body() body: unknown) {
    return this.service.create(context, parseCreateContactInput(body));
  }

  @Get(":contactId")
  @TenantContent("contact.read")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("contactId", new ParseUUIDPipe({ version: "4" })) contactId: string,
  ) {
    return this.service.get(context, contactId);
  }

  @Patch(":contactId")
  @TenantContent("contact.write")
  update(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("contactId", new ParseUUIDPipe({ version: "4" })) contactId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(context, contactId, parseUpdateContactInput(body));
  }

  @Patch(":contactId/consent")
  @TenantContent("contact.write")
  updateConsent(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("contactId", new ParseUUIDPipe({ version: "4" })) contactId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateConsent(context, contactId, parseUpdateContactConsentInput(body));
  }

  @Delete(":contactId")
  @TenantContent("contact.delete")
  remove(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("contactId", new ParseUUIDPipe({ version: "4" })) contactId: string,
  ) {
    return this.service.remove(context, contactId);
  }
}
