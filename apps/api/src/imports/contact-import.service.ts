import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { S3ObjectStorage } from "@whatsapp-platform/storage";

import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { GroupRepository } from "../groups/group.repository.js";
import { ClamAvScanner } from "./clamav-scanner.adapter.js";
import type {
  CreateContactImportInput,
  ListContactImportErrorsInput,
  ListContactImportsInput,
} from "./import.dto.js";
import { ContactImportRepository } from "./contact-import.repository.js";

@Injectable()
export class ContactImportService {
  constructor(
    private readonly repository: ContactImportRepository,
    private readonly groups: GroupRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly outbox: OutboxRepository,
    private readonly tenantScope: TenantScopeService,
    private readonly scanner: ClamAvScanner,
    private readonly storage: S3ObjectStorage,
    private readonly config: RuntimeConfig["uploads"],
  ) {}

  async create(
    context: AuthorizationContext,
    file: Express.Multer.File | undefined,
    input: CreateContactImportInput,
  ) {
    const tenant = this.tenantScope.requireTenantContext(context);
    if (file === undefined || file.buffer.length === 0) throw invalidFile();
    if (file.buffer.length > this.config.maxImportFileBytes) throw invalidFile();
    const contentType = fileType(file);
    await this.scanner.scan(file.buffer);
    const storageKey = `contact-imports/${tenant.tenantId}/${randomUUID()}/${safeFilename(file.originalname)}`;
    await this.storage.put(storageKey, file.buffer, contentType);
    try {
      return await this.transactions.execute(async (transaction) => {
        if (
          input.groupId !== null &&
          !(await this.groups.hasActiveGroup(transaction, tenant.tenantId, input.groupId))
        ) {
          throw new ApplicationError({
            code: "CONTACT_GROUP_NOT_FOUND",
            message: "Contact group not found.",
            statusCode: HttpStatus.NOT_FOUND,
          });
        }
        const job = await this.repository.create(
          transaction,
          tenant.tenantId,
          context.actorId,
          storageKey,
          safeFilename(file.originalname),
          input,
        );
        if (job === undefined) throw new Error("Contact import creation did not return a row.");
        await this.outbox.create(transaction, {
          aggregateId: job.id,
          aggregateType: "contact_import",
          correlationId: job.id,
          eventType: "contact.import.queued",
          payload: { contact_import_id: job.id },
          tenantId: tenant.tenantId,
        });
        await this.repository.audit(
          transaction,
          tenant.tenantId,
          context.actorId,
          tenant.roleSystemKey,
          job.id,
          context.requestId,
        );
        return job;
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async get(context: AuthorizationContext, importId: string) {
    const job = await this.repository.find(
      this.tenantScope.requireTenantContext(context).tenantId,
      importId,
    );
    if (job === undefined)
      throw new ApplicationError({
        code: "CONTACT_IMPORT_NOT_FOUND",
        message: "Contact import not found.",
        statusCode: HttpStatus.NOT_FOUND,
      });
    return job;
  }

  async list(context: AuthorizationContext, input: ListContactImportsInput) {
    return this.repository.list(this.tenantScope.requireTenantContext(context).tenantId, input);
  }

  async listErrors(
    context: AuthorizationContext,
    importId: string,
    input: ListContactImportErrorsInput,
  ) {
    const tenant = this.tenantScope.requireTenantContext(context);
    const job = await this.repository.find(tenant.tenantId, importId);
    if (job === undefined) {
      throw new ApplicationError({
        code: "CONTACT_IMPORT_NOT_FOUND",
        message: "Contact import not found.",
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    return this.repository.listErrors(tenant.tenantId, importId, input);
  }
}

function fileType(file: Express.Multer.File): string {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".csv") && !file.buffer.includes(0)) return "text/csv";
  if (
    name.endsWith(".xlsx") &&
    file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  )
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  throw invalidFile();
}
function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 160) || "import";
}
function invalidFile() {
  return new ApplicationError({
    code: "CONTACT_IMPORT_FILE_INVALID",
    message: "Upload a valid CSV or XLSX file within the import limit.",
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });
}
