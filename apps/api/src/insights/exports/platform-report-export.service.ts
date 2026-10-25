import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { forbiddenError } from "../../authorization/authorization.service.js";
import { PlatformInsightsService } from "../platform-insights.service.js";
import { ReportExportService } from "./report-export.service.js";
import type { ReportExportInput } from "./report-export.dto.js";
import { EXPORT_MAX_ROWS, type CsvReport } from "./report-csv.js";
import { auditCsv, dashboardCsv, paymentsCsv, usageCsv } from "./report-projections.js";

/** No tenant-content service/repository is reachable from this platform use case. */
@Injectable()
export class PlatformReportExportService {
  constructor(
    private readonly insights: PlatformInsightsService,
    private readonly exports: ReportExportService,
  ) {}
  async download(context: AuthorizationContext, input: ReportExportInput) {
    if (
      context.roleSystemKey !== "SUPER_ADMIN" ||
      !context.isPlatformActor ||
      context.tenantId !== null
    )
      throw forbiddenError();
    const query = { ...input.query, cursor: null, limit: EXPORT_MAX_ROWS };
    let report: CsvReport;
    switch (input.kind) {
      case "dashboard":
        report = dashboardCsv(await this.insights.dashboard(context));
        break;
      case "usage":
        if (input.businessId === null) throw forbiddenError();
        report = usageCsv(await this.insights.usage(context, input.businessId));
        break;
      case "payments":
        if (input.businessId === null) throw forbiddenError();
        report = paymentsCsv(await this.insights.payments(context, input.businessId, query));
        break;
      case "audit":
        report = auditCsv(await this.insights.audit(context, query));
        break;
      default:
        throw forbiddenError();
    }
    return this.exports.prepare(
      context,
      input.businessId ?? input.query.tenantId,
      input.kind,
      report,
    );
  }
}
