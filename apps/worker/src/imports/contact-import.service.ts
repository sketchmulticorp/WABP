import { Injectable } from "@nestjs/common";
import { normalizePhoneNumber, toCountryCode } from "@whatsapp-platform/contact-normalization";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { S3ObjectStorage } from "@whatsapp-platform/storage";

import {
  type ContactImportErrorRecord,
  type ContactImportRecord,
  type ImportedContact,
  ContactImportRepository,
} from "./contact-import.repository.js";
import {
  ContactImportParseError,
  parseContactImportFile,
  type ParsedImportRow,
} from "./contact-import.parser.js";

const IMPORT_BATCH_SIZE = 250;

interface ContactImportMapping {
  readonly consentOccurredAt?: string | undefined;
  readonly consentProofReference?: string | undefined;
  readonly consentSource?: string | undefined;
  readonly company?: string | undefined;
  readonly customFields?: string | undefined;
  readonly email?: string | undefined;
  readonly address?: string | undefined;
  readonly groupId?: string | undefined;
  readonly name?: string | undefined;
  readonly phone: string;
}

interface ValidatedRow {
  readonly contact: ImportedContact;
  readonly row: ParsedImportRow;
}

/** Owns import normalization, deduplication, batched persistence, and row-level reporting. */
@Injectable()
export class ContactImportService {
  constructor(
    private readonly repository: ContactImportRepository,
    private readonly storage: S3ObjectStorage,
    private readonly config: RuntimeConfig,
  ) {}

  async process(contactImportId: string): Promise<void> {
    const contactImport = await this.repository.begin(
      contactImportId,
      this.config.imports.processingTimeoutSeconds,
    );
    if (contactImport === undefined) return;
    try {
      const mapping = readMapping(contactImport.mapping);
      if (
        mapping.groupId !== undefined &&
        !(await this.repository.hasActiveGroup(contactImport.tenantId, mapping.groupId))
      ) {
        throw new ContactImportParseError(
          "CONTACT_GROUP_NOT_FOUND",
          "The selected contact group no longer exists.",
        );
      }
      const object = await this.storage.get(contactImport.storageKey);
      const rows = await parseContactImportFile(
        contactImport.originalFilename,
        object.body,
        this.config.uploads.maxImportFileRows,
      );
      await this.persistRows(contactImport, mapping, rows);
    } catch (error) {
      if (error instanceof ContactImportParseError) {
        await this.repository.fail(contactImport.id, error.code);
        return;
      }
      throw error;
    }
  }

  async fail(contactImportId: string, error: unknown): Promise<void> {
    await this.repository.fail(contactImportId, safeErrorCode(error));
  }

  private async persistRows(
    contactImport: ContactImportRecord,
    mapping: ContactImportMapping,
    rows: readonly ParsedImportRow[],
  ): Promise<void> {
    const seenPhones = new Set<string>();
    let insertedRows = 0;
    let invalidRows = 0;
    let pending: ValidatedRow[] = [];
    let errors: ContactImportErrorRecord[] = [];

    for (const row of rows) {
      const validated = validateRow(row, mapping, contactImport.defaultCountryCode, seenPhones);
      if (validated instanceof Error) {
        errors.push(toRowError(row, validated));
        invalidRows += 1;
      } else {
        pending.push(validated);
      }
      if (pending.length >= IMPORT_BATCH_SIZE) {
        const result = await this.persistBatch(contactImport, pending, mapping.groupId ?? null);
        insertedRows += result.insertedRows;
        invalidRows += result.errors.length;
        errors = errors.concat(result.errors);
        pending = [];
      }
      if (errors.length >= IMPORT_BATCH_SIZE) {
        await this.repository.appendErrors(contactImport.id, errors);
        errors = [];
      }
    }

    if (pending.length > 0) {
      const result = await this.persistBatch(contactImport, pending, mapping.groupId ?? null);
      insertedRows += result.insertedRows;
      invalidRows += result.errors.length;
      errors = errors.concat(result.errors);
    }
    if (errors.length > 0) await this.repository.appendErrors(contactImport.id, errors);
    await this.repository.complete(contactImport.id, {
      insertedRows,
      invalidRows,
      totalRows: rows.length,
    });
  }

  private async persistBatch(
    contactImport: ContactImportRecord,
    rows: readonly ValidatedRow[],
    groupId: string | null,
  ): Promise<{
    readonly errors: readonly ContactImportErrorRecord[];
    readonly insertedRows: number;
  }> {
    const insertedPhones = await this.repository.insertBatch(
      contactImport.tenantId,
      rows.map((entry) => entry.contact),
      groupId,
      contactImport.id,
    );
    const errors = rows
      .filter((entry) => !insertedPhones.has(entry.contact.phoneE164))
      .map((entry) => ({
        errorCode: "CONTACT_PHONE_EXISTS",
        errorMessage: "An active contact with this phone number already exists.",
        rowData: entry.row.data,
        rowNumber: entry.row.rowNumber,
      }));
    return { errors, insertedRows: insertedPhones.size };
  }
}

function readMapping(value: unknown): ContactImportMapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContactImportParseError(
      "CONTACT_IMPORT_MAPPING_INVALID",
      "The saved import mapping is invalid.",
    );
  }
  const mapping = value as Record<string, unknown>;
  const phone = text(mapping.phone);
  if (phone === undefined) {
    throw new ContactImportParseError(
      "CONTACT_IMPORT_MAPPING_INVALID",
      "A phone column is required.",
    );
  }
  return {
    phone,
    name: text(mapping.name),
    email: text(mapping.email),
    company: text(mapping.company),
    address: text(mapping.address),
    customFields: text(mapping.customFields),
    consentSource: text(mapping.consentSource),
    consentOccurredAt: text(mapping.consentOccurredAt),
    consentProofReference: text(mapping.consentProofReference),
    groupId: text(mapping.group_id),
  };
}

function validateRow(
  row: ParsedImportRow,
  mapping: ContactImportMapping,
  defaultCountryCode: string | null,
  seenPhones: Set<string>,
): ValidatedRow | Error {
  const rawPhone = row.data[mapping.phone] ?? "";
  const normalized = normalizePhoneNumber(rawPhone, toCountryCode(defaultCountryCode));
  if (normalized === null)
    return importRowError("CONTACT_PHONE_INVALID", "A valid phone number is required.");
  if (seenPhones.has(normalized.e164)) {
    return importRowError(
      "CONTACT_PHONE_DUPLICATE_IN_FILE",
      "This phone number appeared earlier in the import.",
    );
  }
  seenPhones.add(normalized.e164);
  const consent = parseConsent(row, mapping);
  if (consent instanceof Error) return consent;
  const customFields = parseCustomFields(row, mapping);
  if (customFields instanceof Error) return customFields;
  return {
    contact: {
      address: value(row, mapping.address),
      company: value(row, mapping.company),
      consentAt: consent.at,
      consentProofReference: consent.proofReference,
      consentSource: consent.source,
      consentStatus: consent.status,
      customFields,
      email: value(row, mapping.email),
      name: value(row, mapping.name),
      phoneE164: normalized.e164,
    },
    row,
  };
}

function parseConsent(row: ParsedImportRow, mapping: ContactImportMapping) {
  const source = value(row, mapping.consentSource);
  const occurredAt = value(row, mapping.consentOccurredAt);
  const proofReference = value(row, mapping.consentProofReference);
  if (source === null && occurredAt === null && proofReference === null) {
    return { at: null, proofReference: null, source: null, status: "UNKNOWN" as const };
  }
  if (
    source === null ||
    occurredAt === null ||
    proofReference === null ||
    Number.isNaN(Date.parse(occurredAt))
  ) {
    return importRowError(
      "CONTACT_CONSENT_EVIDENCE_INVALID",
      "Opt-in consent requires source, occurred-at, and proof-reference values.",
    );
  }
  return {
    at: new Date(occurredAt).toISOString(),
    proofReference,
    source,
    status: "OPTED_IN" as const,
  };
}

function parseCustomFields(
  row: ParsedImportRow,
  mapping: ContactImportMapping,
): Record<string, unknown> | Error {
  const raw = value(row, mapping.customFields);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    return importRowError(
      "CONTACT_CUSTOM_FIELDS_INVALID",
      "Custom fields must be a JSON object when supplied.",
    );
  }
}

function value(row: ParsedImportRow, header: string | undefined): string | null {
  if (header === undefined) return null;
  const value = row.data[header]?.trim() ?? "";
  return value.length === 0 ? null : value;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function importRowError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

function toRowError(row: ParsedImportRow, error: Error): ContactImportErrorRecord {
  return {
    errorCode:
      "code" in error && typeof error.code === "string" ? error.code : "CONTACT_IMPORT_ROW_INVALID",
    errorMessage: error.message,
    rowData: row.data,
    rowNumber: row.rowNumber,
  };
}

function safeErrorCode(error: unknown): string {
  return error instanceof ContactImportParseError ? error.code : "CONTACT_IMPORT_PROCESSING_FAILED";
}
