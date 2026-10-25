import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

export interface AutomationEvent {
  readonly eventId: string;
  readonly kind: "inbound" | "advance";
  readonly targetId: string;
}
/** Identifier-only transport persistence, independent of tenant message content. */
@Injectable()
export class AutomationOutboxRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}
  async find(id: string): Promise<AutomationEvent | undefined> {
    const result = await this.pool.query<{ id: string; event_type: string; aggregate_id: string }>(
      `SELECT id,event_type,aggregate_id FROM app.outbox_events
      WHERE id=$1 AND event_type IN ('automation.inbound.received','automation.run.advance')`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          eventId: row.id,
          kind: row.event_type === "automation.inbound.received" ? "inbound" : "advance",
          targetId: row.aggregate_id,
        };
  }
  async claim(workerId: string): Promise<AutomationEvent | undefined> {
    const result = await this.pool.query<{ id: string; event_type: string; aggregate_id: string }>(
      `
      WITH candidate AS (SELECT id FROM app.outbox_events WHERE event_type IN ('automation.inbound.received','automation.run.advance')
        AND ((status IN ('PENDING','FAILED') AND available_at<=now()) OR (status='PROCESSING' AND locked_at<now()-interval '5 minutes'))
        ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE app.outbox_events o SET status='PROCESSING',attempt_count=attempt_count+1,locked_at=now(),locked_by=$1
      FROM candidate WHERE o.id=candidate.id RETURNING o.id,o.event_type,o.aggregate_id`,
      [workerId],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          eventId: row.id,
          kind: row.event_type === "automation.inbound.received" ? "inbound" : "advance",
          targetId: row.aggregate_id,
        };
  }
  async published(id: string, workerId: string) {
    await this.pool.query(
      `UPDATE app.outbox_events SET status='PUBLISHED',published_at=now(),locked_at=NULL,locked_by=NULL
      WHERE id=$1 AND status='PROCESSING' AND locked_by=$2`,
      [id, workerId],
    );
  }
  async failedPublication(id: string, workerId: string) {
    await this.pool.query(
      `UPDATE app.outbox_events SET status='FAILED',available_at=now()+interval '5 seconds',locked_at=NULL,locked_by=NULL
      WHERE id=$1 AND status='PROCESSING' AND locked_by=$2`,
      [id, workerId],
    );
  }
  async exhausted(id: string) {
    // Infinity is a scheduling sentinel, not a retention policy. Only explicit replay requeues this work.
    await this.pool.query(
      `UPDATE app.outbox_events SET status='FAILED',available_at='infinity',locked_at=NULL,locked_by=NULL
      WHERE id=$1 AND event_type IN ('automation.inbound.received','automation.run.advance')`,
      [id],
    );
  }
  async lockFailed(session: PoolClient, id: string) {
    const rows = await session.query<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM app.outbox_events
      WHERE id=$1 AND status='FAILED' AND available_at='infinity' AND event_type IN ('automation.inbound.received','automation.run.advance') FOR UPDATE`,
      [id],
    );
    return rows.rows[0];
  }
  async copyEvent(session: PoolClient, id: string) {
    const rows = await session.query<{ id: string }>(
      `INSERT INTO app.outbox_events
      (tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id)
      SELECT tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id FROM app.outbox_events
      WHERE id=$1 AND status='FAILED' AND available_at='infinity' RETURNING id`,
      [id],
    );
    const row = rows.rows[0];
    if (row === undefined) throw new Error("AUTOMATION_REPLAY_EVENT_MISSING");
    return row.id;
  }
  async markReplayed(session: PoolClient, id: string) {
    await session.query(
      `UPDATE app.outbox_events SET status='PUBLISHED' WHERE id=$1 AND status='FAILED'`,
      [id],
    );
  }
  async auditReplay(
    session: PoolClient,
    tenantId: string | null,
    id: string,
    replacementId: string,
  ) {
    await session.query(
      `INSERT INTO app.audit_logs (tenant_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
      VALUES ($1,'OPERATOR','AUTOMATION_EVENT_REPLAY','outbox_event',$2,'SUCCESS',$3::jsonb,$4)`,
      [
        tenantId,
        id,
        JSON.stringify({ replacementEventId: replacementId }),
        `automation-replay:${replacementId}`,
      ],
    );
  }
}
