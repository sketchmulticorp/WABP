/** CSV reports are bounded downloads, not durable export jobs or public file links. */
export type OperationalExportKind = "dashboard" | "usage" | "payments" | "audit";
export type CampaignExportKind = "campaign-summary" | "campaign-recipients";
export interface AuditExportFilters {
  readonly from?: string;
  readonly to?: string;
  readonly action?: string;
  readonly actorId?: string;
  readonly result?: string;
  readonly tenantId?: string;
}
export type TenantReportExportRequest =
  | { readonly kind: Exclude<OperationalExportKind, "audit"> }
  | { readonly kind: "audit"; readonly filters?: AuditExportFilters }
  | { readonly kind: CampaignExportKind; readonly campaignId: string };
export type PlatformReportExportRequest =
  | { readonly kind: "dashboard" }
  | { readonly kind: "usage" | "payments"; readonly businessId: string }
  | { readonly kind: "audit"; readonly filters?: AuditExportFilters };
