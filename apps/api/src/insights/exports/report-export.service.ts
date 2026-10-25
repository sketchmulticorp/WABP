import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { ReportExportRepository } from "./report-export.repository.js";
import { serializeReport, type CsvReport } from "./report-csv.js";

export interface PreparedReport {
  readonly filename: string;
  readonly contents: Buffer;
}
/** Audit failure blocks the download. Prepared is not proof that a browser saved the file. */
@Injectable()
export class ReportExportService {
  constructor(private readonly repository: ReportExportRepository) {}
  async prepare(
    context: AuthorizationContext,
    tenantId: string | null,
    kind: string,
    report: CsvReport,
  ): Promise<PreparedReport> {
    const contents = serializeReport(report);
    await this.repository.prepared(context, tenantId, kind, report.rows.length, contents.length);
    return { filename: `report-${kind}.csv`, contents };
  }
}
