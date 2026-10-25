import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";

import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

export interface ClaimedMessageOutboxEvent {
  readonly id: string;
  readonly messageId: string;
}

@Injectable()
export class MessageOutboxRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async claimNext(
    workerId: string,
    lockTimeoutSeconds: number,
  ): Promise<ClaimedMessageOutboxEvent | undefined> {
    const result = await this.pool.query<{ id: string; payload: unknown }>(
      `WITH candidate AS (
         SELECT id FROM app.outbox_events
         WHERE event_type = 'message.outbound.created'
           AND ((status IN ('PENDING', 'FAILED') AND available_at <= now())
             OR (status = 'PROCESSING' AND locked_at <= now() - ($1 * interval '1 second')))
         ORDER BY available_at ASC, created_at ASC
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE app.outbox_events AS events
       SET status = 'PROCESSING', attempt_count = events.attempt_count + 1,
           locked_at = now(), locked_by = $2
       FROM candidate WHERE events.id = candidate.id
       RETURNING events.id, events.payload`,
      [lockTimeoutSeconds, workerId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const messageId = readMessageId(row.payload);
    if (messageId === null) {
      await this.fail(row.id, workerId, 60_000);
      return undefined;
    }
    return { id: row.id, messageId };
  }

  /** Completes durable publication and the visible message transition atomically. */
  async publish(outboxEventId: string, workerId: string, messageId: string): Promise<void> {
    await this.pool.query(
      `WITH published AS (
         UPDATE app.outbox_events
         SET status = 'PUBLISHED', published_at = now(), locked_at = NULL, locked_by = NULL
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         RETURNING id
       )
       UPDATE app.messages
       SET status = 'QUEUED', updated_at = now()
       WHERE id = $3 AND status = 'CREATED' AND EXISTS (SELECT 1 FROM published)`,
      [outboxEventId, workerId, messageId],
    );
  }

  async fail(outboxEventId: string, workerId: string, delayMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE app.outbox_events
       SET status = 'FAILED', available_at = now() + ($3 * interval '1 millisecond'),
           locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2`,
      [outboxEventId, workerId, delayMs],
    );
  }
}

function readMessageId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).message_id;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;
}
