import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  contactImportErrorsInApp,
  contactImportsInApp,
} from "../database/schema/index.js";
import type {
  CreateContactImportInput,
  ListContactImportErrorsInput,
  ListContactImportsInput,
} from "./import.dto.js";

@Injectable()
export class ContactImportRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async create(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    actorId: string,
    storageKey: string,
    filename: string,
    input: CreateContactImportInput,
  ) {
    const rows = await transaction
      .insert(contactImportsInApp)
      .values({
        defaultCountryCode: input.defaultCountryCode,
        mapping: {
          ...input.mapping,
          ...(input.groupId === null ? {} : { group_id: input.groupId }),
        },
        originalFilename: filename,
        requestedBy: actorId,
        status: "QUEUED",
        storageKey,
        tenantId,
      })
      .returning(importProjection());
    return rows[0];
  }

  async find(tenantId: string, importId: string) {
    const rows = await this.database
      .select(importProjection())
      .from(contactImportsInApp)
      .where(and(eq(contactImportsInApp.tenantId, tenantId), eq(contactImportsInApp.id, importId)))
      .limit(1);
    return rows[0];
  }

  /** Lists recent tenant jobs so users can resume monitoring after closing their browser. */
  async list(tenantId: string, input: ListContactImportsInput) {
    return this.database
      .select(importProjection())
      .from(contactImportsInApp)
      .where(eq(contactImportsInApp.tenantId, tenantId))
      .orderBy(desc(contactImportsInApp.createdAt), desc(contactImportsInApp.id))
      .limit(input.limit);
  }

  async listErrors(tenantId: string, importId: string, input: ListContactImportErrorsInput) {
    const rows = await this.database
      .select({
        errorCode: contactImportErrorsInApp.errorCode,
        errorMessage: contactImportErrorsInApp.errorMessage,
        rowData: contactImportErrorsInApp.rowData,
        rowNumber: contactImportErrorsInApp.rowNumber,
      })
      .from(contactImportErrorsInApp)
      .innerJoin(contactImportsInApp, eq(contactImportErrorsInApp.importId, contactImportsInApp.id))
      .where(
        and(
          eq(contactImportsInApp.tenantId, tenantId),
          eq(contactImportsInApp.id, importId),
          input.afterRowNumber === null
            ? undefined
            : gt(contactImportErrorsInApp.rowNumber, input.afterRowNumber),
        ),
      )
      .orderBy(asc(contactImportErrorsInApp.rowNumber))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const errors = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      errors,
      nextAfterRowNumber: hasMore ? (errors.at(-1)?.rowNumber ?? null) : null,
    };
  }

  async audit(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    actorId: string,
    role: string,
    importId: string,
    requestId: string,
  ) {
    await transaction.insert(auditLogsInApp).values({
      action: "CONTACT_IMPORT_QUEUED",
      actorId,
      actorRole: role,
      entityId: importId,
      entityType: "contact_import",
      metadata: {},
      requestId,
      result: "SUCCESS",
      tenantId,
    });
  }
}

function importProjection() {
  return {
    id: contactImportsInApp.id,
    originalFilename: contactImportsInApp.originalFilename,
    status: contactImportsInApp.status,
    totalRows: contactImportsInApp.totalRows,
    insertedRows: contactImportsInApp.insertedRows,
    invalidRows: contactImportsInApp.invalidRows,
    createdAt: contactImportsInApp.createdAt,
    completedAt: contactImportsInApp.completedAt,
    errorCode: contactImportsInApp.errorCode,
  };
}
