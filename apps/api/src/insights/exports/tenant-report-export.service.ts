import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { TenantScopeService, forbiddenError } from "../../authorization/authorization.service.js";
import { CampaignService } from "../../campaigns/campaign.service.js";
import { CampaignLifecycleService } from "../../campaigns/campaign-lifecycle.service.js";
import { TenantInsightsService } from "../tenant-insights.service.js";
import { ReportExportService } from "./report-export.service.js";
import { CampaignExportRepository } from "./campaign-export.repository.js";
import type { ReportExportInput } from "./report-export.dto.js";
import { EXPORT_MAX_ROWS, type CsvReport } from "./report-csv.js";
import { auditCsv, dashboardCsv, paymentsCsv, usageCsv } from "./report-projections.js";

/** All customer-detail exports stay behind the same tenant-content boundary as normal reads. */
@Injectable()
export class TenantReportExportService {
  constructor(
    private readonly scope: TenantScopeService,
    private readonly insights: TenantInsightsService,
    private readonly campaigns: CampaignService,
    private readonly lifecycle: CampaignLifecycleService,
    private readonly recipients: CampaignExportRepository,
    private readonly exports: ReportExportService,
  ) {}
  async download(context: AuthorizationContext, input: ReportExportInput) {
    const tenant = this.scope.requireTenantContext(context);
    const query = { ...input.query, cursor: null, limit: EXPORT_MAX_ROWS };
    let report: CsvReport;
    switch (input.kind) {
      case "dashboard":
        report = dashboardCsv(await this.insights.dashboard(context));
        break;
      case "usage":
        report = usageCsv(await this.insights.usage(context));
        break;
      case "payments":
        report = paymentsCsv(await this.insights.payments(context, query));
        break;
      case "audit":
        report = auditCsv(await this.insights.audit(context, query));
        break;
      case "campaign-summary":
      case "campaign-recipients": {
        if (
          !context.permissions.has("campaign.export") ||
          !context.permissions.has("campaign.read") ||
          input.campaignId === null
        )
          throw forbiddenError();
        if (input.kind === "campaign-recipients") {
          if (
            !context.permissions.has("contact.export") ||
            !context.permissions.has("contact.read")
          )
            throw forbiddenError();
          await this.campaigns.read(context, input.campaignId);
          const rows = await this.recipients.recipients(tenant, input.campaignId);
          report = {
            headers: [
              "campaign_id",
              "contact_id",
              "phone_e164",
              "status",
              "error_code",
              "recipient_created_at",
              "recipient_updated_at",
              "sent_at",
              "delivered_at",
              "read_at",
            ],
            rows: rows.map((r) => [
              input.campaignId,
              r.contactId,
              r.phone,
              r.status,
              r.errorCode === null
                ? null
                : /^[A-Z0-9_]{1,100}$/u.test(r.errorCode)
                  ? r.errorCode
                  : "REDACTED",
              r.createdAt,
              r.updatedAt,
              r.sentAt,
              r.deliveredAt,
              r.readAt,
            ]),
          };
        } else {
          const result = await this.lifecycle.report(context, input.campaignId);
          report = {
            headers: [
              "campaign_id",
              "campaign_status",
              "as_of",
              "delivery_status",
              "recipient_count",
            ],
            rows:
              result.counts.length === 0
                ? [[input.campaignId, result.campaign.status, result.asOf, "NO_RECIPIENTS", 0]]
                : result.counts.map((r) => [
                    input.campaignId,
                    result.campaign.status,
                    result.asOf,
                    r.status,
                    r.count,
                  ]),
          };
        }
        break;
      }
    }
    return this.exports.prepare(context, tenant.tenantId, input.kind, report);
  }
}
