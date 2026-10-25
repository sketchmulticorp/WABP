import { ApplicationError } from "../../common/errors/application-error.js";

export const EXPORT_MAX_ROWS = 10_000;
export const EXPORT_MAX_BYTES = 10 * 1024 * 1024;
export type CsvCell = string | number | boolean | null | undefined;
export interface CsvReport {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly CsvCell[])[];
}
export function exportTooLarge(): never {
  throw new ApplicationError({
    code: "REPORT_EXPORT_TOO_LARGE",
    message:
      "This report exceeds 10,000 rows or 10 MiB. Narrow the audit filters or select a smaller campaign. Large asynchronous exports are not available in this MVP.",
    statusCode: 422,
  });
}
/** Quote every cell and neutralize spreadsheet formula prefixes, including hidden whitespace. */
function cell(value: CsvCell): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
/** Buffer completely before sending; bounds never produce a silently truncated CSV. */
export function serializeReport(report: CsvReport): Buffer {
  if (report.rows.length > EXPORT_MAX_ROWS) exportTooLarge();
  const parts = [Buffer.from(`\uFEFF${report.headers.map(cell).join(",")}\r\n`, "utf8")];
  let bytes = parts[0]?.length ?? 0;
  for (const row of report.rows) {
    if (row.length !== report.headers.length) throw new Error("Report column mapping mismatch.");
    const part = Buffer.from(`${row.map(cell).join(",")}\r\n`, "utf8");
    bytes += part.length;
    if (bytes > EXPORT_MAX_BYTES) exportTooLarge();
    parts.push(part);
  }
  if (bytes > EXPORT_MAX_BYTES) exportTooLarge();
  return Buffer.concat(parts, bytes);
}
