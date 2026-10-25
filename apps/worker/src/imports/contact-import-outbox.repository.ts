import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";

import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

interface ClaimedImportOutboxEvent {
  readonly id: string;
  readonly contactImportId: string;
}

@Injectable()
export class ContactImportOutboxRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async claimNext(
    workerId: string,
    lockTimeoutSeconds: number,
  ): Promise<ClaimedImportOutboxEvent | undefined> {
    const result = await this.pool.query<{ id: string; payload: unknown }>(
      `
        WITH candidate AS (
          SELECT id
          FROM app.outbox_events
          WHERE event_type = 'contact.import.queued'
            AND (
              (status IN ('PENDING', 'FAILED') AND available_at <= now())
              OR (status = 'PROCESSING' AND locked_at <= now() - ($1 * interval '1 second'))
            )
          ORDER BY available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE app.outbox_events AS events
        SET status = 'PROCESSING',
            attempt_count = events.attempt_count + 1,
            locked_at = now(),
            locked_by = $2
        FROM candidate
        WHERE events.id = candidate.id
        RETURNING events.id, events.payload
      `,
      [lockTimeoutSeconds, workerId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const contactImportId = readContactImportId(row.payload);
    if (contactImportId === null) {
      await this.fail(row.id, workerId, 60_000);
      return undefined;
    }
    return { id: row.id, contactImportId };
  }

  async publish(outboxEventId: string, workerId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.outbox_events
        SET status = 'PUBLISHED', published_at = now(), locked_at = NULL, locked_by = NULL
        WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
      `,
      [outboxEventId, workerId],
    );
  }

  async fail(outboxEventId: string, workerId: string, delayMs: number): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.outbox_events
        SET status = 'FAILED',
            available_at = now() + ($3 * interval '1 millisecond'),
            locked_at = NULL,
            locked_by = NULL
        WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
      `,
      [outboxEventId, workerId, delayMs],
    );
  }
}

function readContactImportId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).contact_import_id;
  return typeof value === "string" && isUuid(value) ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
