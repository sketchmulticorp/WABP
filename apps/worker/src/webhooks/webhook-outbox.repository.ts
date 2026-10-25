import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";

import { WORKER_DATABASE_POOL } from "./webhook.constants.js";

interface ClaimedOutboxEvent {
  readonly id: string;
  readonly webhookEventId: string;
}

@Injectable()
export class WebhookOutboxRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async claimNext(
    workerId: string,
    lockTimeoutSeconds: number,
  ): Promise<ClaimedOutboxEvent | undefined> {
    const result = await this.pool.query<{
      id: string;
      payload: unknown;
    }>(
      `
        WITH candidate AS (
          SELECT id
          FROM app.outbox_events
          WHERE event_type = 'webhook.event.received'
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
    const webhookEventId = readWebhookEventId(row.payload);
    if (webhookEventId === null) {
      await this.fail(row.id, workerId, 60_000);
      return undefined;
    }
    return { id: row.id, webhookEventId };
  }

  async publish(outboxEventId: string, webhookEventId: string, workerId: string): Promise<void> {
    await this.pool.query(
      `
        WITH published AS (
          UPDATE app.outbox_events
          SET status = 'PUBLISHED', published_at = now(), locked_at = NULL, locked_by = NULL
          WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $3
          RETURNING id
        )
        UPDATE app.webhook_events
        SET status = 'QUEUED', last_error_code = NULL
        WHERE id = $2
          AND status IN ('RECEIVED', 'FAILED')
          AND EXISTS (SELECT 1 FROM published)
      `,
      [outboxEventId, webhookEventId, workerId],
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

function readWebhookEventId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).webhook_event_id;
  return typeof value === "string" && isUuid(value) ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
