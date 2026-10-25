import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

export interface ContactImportRecord {
  readonly defaultCountryCode: string | null;
  readonly id: string;
  readonly mapping: unknown;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly tenantId: string;
}

export interface ImportedContact {
  readonly address: string | null;
  readonly company: string | null;
  readonly consentAt: string | null;
  readonly consentProofReference: string | null;
  readonly consentSource: string | null;
  readonly consentStatus: "OPTED_IN" | "UNKNOWN";
  readonly customFields: Record<string, unknown>;
  readonly email: string | null;
  readonly name: string | null;
  readonly phoneE164: string;
}

export interface ContactImportErrorRecord {
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly rowData: Record<string, string>;
  readonly rowNumber: number;
}

@Injectable()
export class ContactImportRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async begin(
    contactImportId: string,
    processingTimeoutSeconds: number,
  ): Promise<ContactImportRecord | undefined> {
    const result = await this.pool.query<ContactImportRecord>(
      `
        UPDATE app.contact_imports
        -- Refresh the lease when reclaiming a stale job so another worker cannot claim it concurrently.
        SET status = 'PROCESSING', started_at = now(), error_code = NULL
        WHERE id = $1
          AND (
            status IN ('QUEUED', 'FAILED')
            OR (status = 'PROCESSING' AND started_at < now() - ($2 * interval '1 second'))
          )
        RETURNING id,
                  tenant_id AS "tenantId",
                  storage_key AS "storageKey",
                  original_filename AS "originalFilename",
                  mapping,
                  default_country_code AS "defaultCountryCode"
      `,
      [contactImportId, processingTimeoutSeconds],
    );
    return result.rows[0];
  }

  async hasActiveGroup(tenantId: string, groupId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM app.contact_groups
        WHERE id = $1 AND tenant_id = $2 AND is_deleted = false
        LIMIT 1
      `,
      [groupId, tenantId],
    );
    return result.rowCount === 1;
  }

  /** Inserts one bounded batch and returns the phones that won the active-contact uniqueness race. */
  async insertBatch(
    tenantId: string,
    contacts: readonly ImportedContact[],
    groupId: string | null,
    importId: string,
  ): Promise<ReadonlySet<string>> {
    if (contacts.length === 0) return new Set();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string; phoneE164: string }>(
        `
          INSERT INTO app.contacts (
            tenant_id, phone_e164, name, email, company, address, source, custom_fields,
            consent_status, consent_source, consent_at, consent_proof_reference
          )
          SELECT $1,
                 value.phone_e164,
                 NULLIF(value.name, ''),
                 NULLIF(value.email, ''),
                 NULLIF(value.company, ''),
                 NULLIF(value.address, ''),
                 $3,
                 value.custom_fields,
                 value.consent_status,
                 NULLIF(value.consent_source, ''),
                 value.consent_at,
                 NULLIF(value.consent_proof_reference, '')
          FROM jsonb_to_recordset($2::jsonb) AS value(
            phone_e164 text,
            name text,
            email text,
            company text,
            address text,
            custom_fields jsonb,
            consent_status text,
            consent_source text,
            consent_at timestamptz,
            consent_proof_reference text
          )
          ON CONFLICT (tenant_id, phone_e164) WHERE is_deleted = false DO NOTHING
          RETURNING id, phone_e164 AS "phoneE164"
        `,
        [tenantId, JSON.stringify(contacts), `IMPORT:${importId}`],
      );
      const insertedPhones = new Set(inserted.rows.map((row) => row.phoneE164));
      const retryRows = await client.query<{ id: string; phoneE164: string }>(
        `
          SELECT id, phone_e164 AS "phoneE164"
          FROM app.contacts
          WHERE tenant_id = $1
            AND source = $2
            AND is_deleted = false
            AND phone_e164 = ANY($3::text[])
        `,
        [tenantId, `IMPORT:${importId}`, contacts.map((contact) => contact.phoneE164)],
      );
      for (const row of retryRows.rows) insertedPhones.add(row.phoneE164);
      if (groupId !== null && retryRows.rows.length > 0) {
        await client.query(
          `
            INSERT INTO app.contact_group_members (tenant_id, group_id, contact_id)
            SELECT $1, $2, value.id
            FROM jsonb_to_recordset($3::jsonb) AS value(id uuid)
            ON CONFLICT (group_id, contact_id) WHERE is_deleted = false DO NOTHING
          `,
          [tenantId, groupId, JSON.stringify(retryRows.rows.map((row) => ({ id: row.id })))],
        );
      }
      await client.query("COMMIT");
      return insertedPhones;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async appendErrors(importId: string, errors: readonly ContactImportErrorRecord[]): Promise<void> {
    if (errors.length === 0) return;
    await this.pool.query(
      `
        INSERT INTO app.contact_import_errors (import_id, row_number, error_code, error_message, row_data)
        SELECT $1, value.row_number, value.error_code, value.error_message, value.row_data
        FROM jsonb_to_recordset($2::jsonb) AS value(
          row_number integer,
          error_code text,
          error_message text,
          row_data jsonb
        )
        ON CONFLICT (import_id, row_number, error_code) DO NOTHING
      `,
      [importId, JSON.stringify(errors.map(toErrorPayload))],
    );
  }

  async complete(
    importId: string,
    counts: {
      readonly insertedRows: number;
      readonly invalidRows: number;
      readonly totalRows: number;
    },
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.contact_imports
        SET status = 'COMPLETED',
            total_rows = $2,
            inserted_rows = $3,
            invalid_rows = $4,
            updated_rows = 0,
            completed_at = now(),
            error_code = NULL
        WHERE id = $1 AND status = 'PROCESSING'
      `,
      [importId, counts.totalRows, counts.insertedRows, counts.invalidRows],
    );
  }

  async fail(importId: string, errorCode: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.contact_imports
        SET status = 'FAILED', error_code = $2, completed_at = now()
        WHERE id = $1 AND status = 'PROCESSING'
      `,
      [importId, errorCode],
    );
  }

  async findExpiredStoredFiles(
    retentionDays: number,
  ): Promise<readonly { readonly id: string; readonly storageKey: string }[]> {
    const result = await this.pool.query<{ id: string; storageKey: string }>(
      `
        SELECT id, storage_key AS "storageKey"
        FROM app.contact_imports
        WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
          AND storage_deleted_at IS NULL
          AND created_at < now() - ($1 * interval '1 day')
        ORDER BY created_at ASC
        LIMIT 100
      `,
      [retentionDays],
    );
    return result.rows;
  }

  async markStoredFileDeleted(importId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.contact_imports
        SET storage_deleted_at = now()
        WHERE id = $1 AND storage_deleted_at IS NULL
      `,
      [importId],
    );
  }

  async deleteExpiredErrors(retentionDays: number): Promise<number> {
    const result = await this.pool.query(
      `
        DELETE FROM app.contact_import_errors AS errors
        USING app.contact_imports AS imports
        WHERE errors.import_id = imports.id
          AND imports.status IN ('COMPLETED', 'FAILED', 'CANCELLED')
          AND imports.created_at < now() - ($1 * interval '1 day')
      `,
      [retentionDays],
    );
    return result.rowCount ?? 0;
  }
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original persistence error remains the actionable failure.
  }
}

function toErrorPayload(error: ContactImportErrorRecord) {
  return {
    error_code: error.errorCode,
    error_message: error.errorMessage,
    row_data: error.rowData,
    row_number: error.rowNumber,
  };
}
