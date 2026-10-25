import { BadRequestException } from "@nestjs/common";
import { parseInsightQuery, type InsightQuery } from "../insights.dto.js";
import type { CampaignExportKind, OperationalExportKind } from "@whatsapp-platform/contracts";

export interface ReportExportInput {
  readonly kind: OperationalExportKind | CampaignExportKind;
  readonly campaignId: string | null;
  readonly businessId: string | null;
  readonly query: InsightQuery;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function invalid(): never {
  throw new BadRequestException("Invalid report export request.");
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
/** Export starts at the first row; callers cannot inject pagination or tenant overrides. */
export function parseReportExport(raw: unknown, platform = false): ReportExportInput {
  const input = record(raw),
    kind = input.kind;
  if (
    kind !== "dashboard" &&
    kind !== "usage" &&
    kind !== "payments" &&
    kind !== "audit" &&
    kind !== "campaign-summary" &&
    kind !== "campaign-recipients"
  )
    invalid();
  const campaign = kind === "campaign-summary" || kind === "campaign-recipients";
  if (platform && campaign) invalid();
  const business = platform && (kind === "usage" || kind === "payments");
  const allowed = [
    "kind",
    ...(campaign ? ["campaignId"] : []),
    ...(business ? ["businessId"] : []),
    ...(kind === "audit" ? ["filters"] : []),
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key))) invalid();
  const id = (key: string) => {
    const value = input[key];
    if (typeof value !== "string" || !uuid.test(value)) invalid();
    return value;
  };
  const filters = kind === "audit" && input.filters !== undefined ? record(input.filters) : {};
  // An export always includes the full matching bounded result, not the visible UI page.
  if ("cursor" in filters || "limit" in filters) invalid();
  const query = parseInsightQuery(filters, kind === "audit" ? "audit" : "page", platform);
  return {
    kind,
    campaignId: campaign ? id("campaignId") : null,
    businessId: business ? id("businessId") : null,
    query,
  };
}
