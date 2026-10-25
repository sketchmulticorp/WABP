import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import yauzl from "yauzl";

const MAX_XLSX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export interface ParsedImportRow {
  readonly data: Record<string, string>;
  readonly rowNumber: number;
}

export class ContactImportParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Parses the first worksheet only; the import contract is one header row and one contact per row. */
export async function parseContactImportFile(
  filename: string,
  file: Uint8Array,
  maxRows: number,
): Promise<readonly ParsedImportRow[]> {
  if (filename.toLowerCase().endsWith(".csv")) return parseCsv(file, maxRows);
  if (filename.toLowerCase().endsWith(".xlsx")) return parseXlsx(file, maxRows);
  throw new ContactImportParseError(
    "CONTACT_IMPORT_FILE_INVALID",
    "Unsupported contact import file.",
  );
}

function parseCsv(file: Uint8Array, maxRows: number): readonly ParsedImportRow[] {
  let values: string[][];
  try {
    values = parse(file, {
      bom: true,
      columns: false,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ContactImportParseError("CONTACT_IMPORT_PARSE_FAILED", "The CSV file is malformed.");
  }
  return rowsToRecords(values, maxRows);
}

async function parseXlsx(file: Uint8Array, maxRows: number): Promise<readonly ParsedImportRow[]> {
  await assertSafeXlsxArchive(file);
  try {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS is typed against an older Node Buffer declaration; its runtime accepts Uint8Array.
    const loadWorkbook = (input: Uint8Array) =>
      (workbook.xlsx.load as unknown as (value: Uint8Array) => Promise<unknown>)(input);
    await loadWorkbook(file);
    const worksheet = workbook.worksheets[0];
    if (worksheet === undefined) {
      throw new ContactImportParseError(
        "CONTACT_IMPORT_PARSE_FAILED",
        "The XLSX file has no worksheet.",
      );
    }
    const values: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues = Array.isArray(row.values) ? row.values : [];
      values.push(rowValues.slice(1).map((value) => cellValue(value)));
    });
    return rowsToRecords(values, maxRows);
  } catch (error) {
    if (error instanceof ContactImportParseError) throw error;
    throw new ContactImportParseError("CONTACT_IMPORT_PARSE_FAILED", "The XLSX file is malformed.");
  }
}

function rowsToRecords(values: readonly string[][], maxRows: number): readonly ParsedImportRow[] {
  const header = values[0]?.map((value) => value.trim());
  if (header === undefined || header.length === 0 || header.some((value) => value.length === 0)) {
    throw new ContactImportParseError(
      "CONTACT_IMPORT_HEADERS_INVALID",
      "The import must start with one complete header row.",
    );
  }
  if (new Set(header.map((value) => value.toLocaleLowerCase())).size !== header.length) {
    throw new ContactImportParseError(
      "CONTACT_IMPORT_HEADERS_INVALID",
      "Column headers must be unique, ignoring case.",
    );
  }
  const rows = values.slice(1);
  if (rows.length > maxRows) {
    throw new ContactImportParseError(
      "CONTACT_IMPORT_ROW_LIMIT_EXCEEDED",
      `The import contains more than ${String(maxRows)} rows.`,
    );
  }
  return rows.map((row, index) => ({
    data: Object.fromEntries(header.map((column, columnIndex) => [column, row[columnIndex] ?? ""])),
    rowNumber: index + 2,
  }));
}

function cellValue(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string")
    return value.text.trim();
  return "";
}

function assertSafeXlsxArchive(file: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      file as unknown as Buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, archive) => {
        if (error !== null) {
          reject(
            new ContactImportParseError(
              "CONTACT_IMPORT_PARSE_FAILED",
              "The XLSX file is malformed.",
            ),
          );
          return;
        }
        let uncompressedBytes = 0;
        archive.on("entry", (entry: yauzl.Entry) => {
          uncompressedBytes += entry.uncompressedSize;
          if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
            archive.close();
            reject(
              new ContactImportParseError(
                "CONTACT_IMPORT_XLSX_EXPANSION_LIMIT",
                "The XLSX file expands beyond the safe import limit.",
              ),
            );
            return;
          }
          archive.readEntry();
        });
        archive.once("end", resolve);
        archive.once("error", () => {
          reject(
            new ContactImportParseError(
              "CONTACT_IMPORT_PARSE_FAILED",
              "The XLSX file is malformed.",
            ),
          );
        });
        archive.readEntry();
      },
    );
  });
}
