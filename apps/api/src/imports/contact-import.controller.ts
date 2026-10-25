import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentAuthorization, TenantContent } from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  parseCreateContactImportInput,
  parseListContactImportErrorsInput,
  parseListContactImportsInput,
} from "./import.dto.js";
import { ContactImportService } from "./contact-import.service.js";

/** HTTP transport only: bounded multipart parsing then delegation to the secure import service. */
@Controller("contacts/imports")
export class ContactImportController {
  constructor(private readonly service: ContactImportService) {}

  @Post()
  @TenantContent("contact.import")
  @UseInterceptors(FileInterceptor("file", { limits: { files: 1, fileSize: 10_485_760 } }))
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    return this.service.create(context, file, parseCreateContactImportInput(body));
  }

  @Get()
  @TenantContent("contact.read")
  list(@CurrentAuthorization() context: AuthorizationContext, @Query() query: unknown) {
    return this.service.list(context, parseListContactImportsInput(query));
  }

  @Get(":importId")
  @TenantContent("contact.read")
  get(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("importId", new ParseUUIDPipe({ version: "4" })) importId: string,
  ) {
    return this.service.get(context, importId);
  }

  @Get(":importId/errors")
  @TenantContent("contact.read")
  listErrors(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("importId", new ParseUUIDPipe({ version: "4" })) importId: string,
    @Query() query: unknown,
  ) {
    return this.service.listErrors(context, importId, parseListContactImportErrorsInput(query));
  }
}
