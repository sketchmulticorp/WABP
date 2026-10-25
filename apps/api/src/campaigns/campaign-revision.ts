import { createHash } from "node:crypto";

/** A content-derived optimistic edit token also covers metadata-only changes. */
export function campaignRevision(draft: {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly contentVersion: number;
  readonly updatedAt: string;
  readonly status: string;
  readonly approvalStatus: string;
  readonly whatsappAccountId: string;
  readonly templateId: string;
  readonly audienceDefinition: unknown;
  readonly variableMapping: unknown;
}): string {
  return createHash("sha256").update(canonical(draft)).digest("hex");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item: unknown) => canonical(item)));
  if (typeof value === "object" && value !== null)
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return JSON.stringify(value);
}
