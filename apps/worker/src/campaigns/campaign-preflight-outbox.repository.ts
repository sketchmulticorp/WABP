import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

@Injectable()
export class CampaignPreflightOutboxRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}
  async claimNext(workerId: string) {
    const result = await this.pool.query<{ id: string; payload: unknown }>(
      `WITH candidate AS (
         SELECT id FROM app.outbox_events
         WHERE event_type='campaign.preflight.queued'
           AND ((status IN ('PENDING','FAILED') AND available_at<=now())
             OR (status='PROCESSING' AND locked_at<=now()-interval '5 minutes'))
         ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE app.outbox_events e SET status='PROCESSING',attempt_count=e.attempt_count+1,
         locked_at=now(),locked_by=$1 FROM candidate WHERE e.id=candidate.id
       RETURNING e.id,e.payload`,
      [workerId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const id = readRunId(row.payload);
    if (id === null) {
      await this.fail(row.id, workerId);
      return undefined;
    }
    return { id: row.id, preflightRunId: id };
  }
  async publish(id: string, workerId: string) {
    await this.pool.query(
      `UPDATE app.outbox_events SET status='PUBLISHED',published_at=now(),locked_at=NULL,locked_by=NULL
       WHERE id=$1 AND status='PROCESSING' AND locked_by=$2`,
      [id, workerId],
    );
  }
  async fail(id: string, workerId: string) {
    await this.pool.query(
      `UPDATE app.outbox_events SET status='FAILED',available_at=now()+interval '5 seconds',
       locked_at=NULL,locked_by=NULL WHERE id=$1 AND status='PROCESSING' AND locked_by=$2`,
      [id, workerId],
    );
  }
}
function readRunId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).campaign_preflight_run_id;
  return typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value) ? value : null;
}
