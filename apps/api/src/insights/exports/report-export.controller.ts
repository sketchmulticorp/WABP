import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import {
  Authenticated,
  CurrentAuthorization,
  TenantContent,
} from "../../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { parseReportExport } from "./report-export.dto.js";
import { TenantReportExportService } from "./tenant-report-export.service.js";
import { PlatformReportExportService } from "./platform-report-export.service.js";
import type { PreparedReport } from "./report-export.service.js";

interface CsvResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
}
function sendReport(response: CsvResponse, report: PreparedReport): void {
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
  response.setHeader("Content-Length", String(report.contents.length));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.send(report.contents);
}
/** Explicit response ownership mirrors the existing webhook text endpoint; JSON errors stay enveloped. */
@Controller("reports/exports")
export class TenantReportExportController {
  constructor(private readonly service: TenantReportExportService) {}
  @Post()
  @HttpCode(200)
  @TenantContent()
  async download(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() body: unknown,
    @Res() response: CsvResponse,
  ): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    sendReport(response, await this.service.download(context, parseReportExport(body)));
  }
}
@Controller("platform/reports/exports")
export class PlatformReportExportController {
  constructor(private readonly service: PlatformReportExportService) {}
  @Post()
  @HttpCode(200)
  @Authenticated()
  async download(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() body: unknown,
    @Res() response: CsvResponse,
  ): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    sendReport(response, await this.service.download(context, parseReportExport(body, true)));
  }
}
