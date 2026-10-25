import { Inject, Injectable } from "@nestjs/common";
import { APP_DATABASE } from "../../database/database.constants.js";
import type { AppDatabase } from "../../database/database.types.js";
import { auditLogsInApp } from "../../database/schema/index.js";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";

/** Audit persistence only; deliberately has no customer-content query capability. */
@Injectable()
export class ReportExportRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async prepared(
    context: AuthorizationContext,
    targetTenantId: string | null,
    kind: string,
    rows: number,
    bytes: number,
  ) {
    await this.database.insert(auditLogsInApp).values({
      // Platform filters may name a nonexistent business; they are not audit-row ownership.
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorRole: context.roleSystemKey,
      action: "REPORT_EXPORT_PREPARED",
      entityType: "REPORT_EXPORT",
      result: "SUCCESS",
      requestId: context.requestId,
      metadata: { kind, format: "CSV", rows, bytes, targetTenantId },
    });
  }
}
