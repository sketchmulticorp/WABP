import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type {
  AutomationConversation,
  AutomationRun,
  AutomationRunState,
  RunStatus,
  AutomationTrigger,
} from "./automation.types.js";
type Row<T> = { [K in keyof T]: T[K] };

/** Durable runtime data access; no trigger evaluation or workflow decisions in this layer. */
@Injectable()
export class AutomationRunRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async failedMessage(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    runId: string,
  ) {
    const rows = await tx.execute<{
      code: string | null;
    }>(sql`SELECT error_code AS code FROM app.messages
      WHERE tenant_id=${tenantId}::uuid AND conversation_id=${conversationId}::uuid AND direction='OUTBOUND' AND status='FAILED'
        AND policy_decision->>'source'='AUTOMATION' AND policy_decision->'automation'->>'runId'=${runId} LIMIT 1`);
    return rows.rows[0] === undefined ? null : (rows.rows[0].code ?? "AUTOMATION_MESSAGE_FAILED");
  }
  async latest(tx: AppDatabaseTransaction, tenantId: string, conversationId: string) {
    const rows = await tx.execute<{ runId: string; status: RunStatus; reason: string | null }>(sql`
      SELECT r.id AS "runId",r.status,r.state->>'reason' AS reason FROM app.automation_runs r
      JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE r.tenant_id=${tenantId}::uuid AND r.conversation_id=${conversationId}::uuid
      ORDER BY (r.status IN ('RUNNING','WAITING','PAUSED','HANDED_OFF')) DESC,r.started_at DESC,r.id DESC LIMIT 1`);
    return rows.rows[0] ?? null;
  }
  async flowConversations(tx: AppDatabaseTransaction, tenantId: string, flowId: string) {
    const rows = await tx.execute<{
      id: string;
    }>(sql`SELECT DISTINCT r.conversation_id AS id FROM app.automation_runs r
      JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE r.tenant_id=${tenantId}::uuid AND v.flow_id=${flowId}::uuid AND r.status IN ('RUNNING','WAITING') ORDER BY id`);
    return rows.rows;
  }
  async controlAudit(
    tx: AppDatabaseTransaction,
    context: AuthorizationContext,
    tenantId: string,
    conversationId: string,
    action: string,
  ) {
    // The allow watermark is the decision time after locking, not transaction start time.
    await tx.execute(sql`INSERT INTO app.audit_logs (tenant_id,actor_id,actor_role,action,entity_type,entity_id,result,request_id,created_at)
      VALUES (${tenantId}::uuid,${context.actorId}::uuid,${context.roleSystemKey},${action},'conversation',${conversationId},'SUCCESS',${context.requestId},clock_timestamp())`);
  }
  async allowedAt(tx: AppDatabaseTransaction, tenantId: string, conversationId: string) {
    const rows = await tx.execute<{
      at: string;
    }>(sql`SELECT created_at::text AS at FROM app.audit_logs
      WHERE tenant_id=${tenantId}::uuid AND entity_type='conversation' AND entity_id=${conversationId} AND action='AUTOMATION_ALLOWED'
      ORDER BY created_at DESC,id DESC LIMIT 1`);
    return rows.rows[0]?.at ?? null;
  }
  async claimAdvance(tx: AppDatabaseTransaction, tenantId: string, runId: string, eventId: string) {
    const rows =
      await tx.execute(sql`UPDATE app.outbox_events SET payload=jsonb_set(payload,'{processed}','true'::jsonb)
      WHERE tenant_id=${tenantId}::uuid AND id=${eventId}::uuid AND aggregate_id=${runId}::uuid AND event_type='automation.run.advance'
      AND coalesce(payload->>'processed','false')<>'true' RETURNING id`);
    return rows.rows.length === 1;
  }
  async lockContact(tx: AppDatabaseTransaction, tenantId: string, conversationId: string) {
    // Inbound ingestion locks Contact before Conversation. Match that order for CONTACT_UPDATE.
    await tx.execute(sql`SELECT ct.id FROM app.contacts ct JOIN app.conversations c ON c.tenant_id=ct.tenant_id AND c.contact_id=ct.id
      WHERE c.tenant_id=${tenantId}::uuid AND c.id=${conversationId}::uuid AND ct.is_deleted=false FOR UPDATE OF ct`);
  }

  async claimInbound(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    id: string,
  ) {
    const rows =
      await tx.execute(sql`UPDATE app.messages SET policy_decision=jsonb_set(policy_decision,'{automationProcessed}','true'::jsonb)
      WHERE tenant_id=${tenantId}::uuid AND conversation_id=${conversationId}::uuid AND id=${id}::uuid AND direction='INBOUND'
      AND coalesce(policy_decision->>'automationProcessed','false')<>'true' RETURNING id`);
    return rows.rows.length === 1;
  }
  async version(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await tx.execute<{
      flowId: string;
      flowStatus: string;
      trigger: AutomationTrigger;
      publishedAt: string | null;
    }>(sql`
      SELECT f.id AS "flowId",f.status AS "flowStatus",v.trigger_config AS trigger,v.published_at::text AS "publishedAt"
      FROM app.automation_versions v JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE v.tenant_id=${tenantId}::uuid AND v.id=${id}::uuid AND v.status='PUBLISHED'`);
    return rows.rows[0];
  }
  async runtimeAudit(
    tx: AppDatabaseTransaction,
    tenantId: string,
    runId: string,
    action: string,
    reason: string | null = null,
  ) {
    await tx.execute(sql`INSERT INTO app.audit_logs (tenant_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
      VALUES (${tenantId}::uuid,'AUTOMATION',${action},'automation_run',${runId},'SUCCESS',${JSON.stringify({ reason })}::jsonb,${`automation:${runId}`})`);
  }

  async inbound(id: string) {
    const rows = await this.database.execute<{
      id: string;
      tenantId: string;
      conversationId: string;
      accountId: string;
      content: Record<string, unknown>;
      providerCreatedAt: string;
      messageType: string;
    }>(sql`
      SELECT m.id,m.tenant_id AS "tenantId",m.conversation_id AS "conversationId",m.whatsapp_account_id AS "accountId",
        m.content,m.provider_created_at::text AS "providerCreatedAt",m.message_type AS "messageType"
      FROM app.messages m JOIN app.contacts c ON c.tenant_id=m.tenant_id AND c.id=m.contact_id AND c.is_deleted=false
      WHERE m.id=${id}::uuid AND m.direction='INBOUND'`);
    return rows.rows[0];
  }
  async conversation(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AutomationConversation | undefined> {
    const rows = await tx.execute<Row<AutomationConversation>>(sql`
      SELECT c.id,c.contact_id AS "contactId",c.whatsapp_account_id AS "accountId",c.status,
        c.automation_state AS "automationState",c.window_expires_at::text AS "windowExpiresAt",ct.consent_status AS "consentStatus"
      FROM app.conversations c JOIN app.contacts ct ON ct.tenant_id=c.tenant_id AND ct.id=c.contact_id AND ct.is_deleted=false
      WHERE c.tenant_id=${tenantId}::uuid AND c.id=${id}::uuid FOR UPDATE OF c`);
    return rows.rows[0];
  }
  async active(tx: AppDatabaseTransaction, tenantId: string, conversationId: string) {
    const rows = await tx.execute<Row<AutomationRun>>(sql`
      SELECT ${runProjection()} FROM app.automation_runs r
      JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE r.tenant_id=${tenantId}::uuid AND r.conversation_id=${conversationId}::uuid
      AND r.status IN ('RUNNING','WAITING','PAUSED','HANDED_OFF') FOR UPDATE OF r`);
    return rows.rows[0];
  }
  async find(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await tx.execute<Row<AutomationRun>>(sql`
      SELECT ${runProjection()} FROM app.automation_runs r
      JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE r.tenant_id=${tenantId}::uuid AND r.id=${id}::uuid FOR UPDATE OF r`);
    return rows.rows[0];
  }
  async runIdentity(id: string) {
    const rows = await this.database.execute<{
      tenantId: string;
      conversationId: string;
      flowId: string;
      versionId: string;
    }>(sql`
      SELECT r.tenant_id AS "tenantId",r.conversation_id AS "conversationId",v.flow_id AS "flowId",r.flow_version_id AS "versionId"
      FROM app.automation_runs r JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false WHERE r.id=${id}::uuid`);
    return rows.rows[0];
  }
  async candidates(tx: AppDatabaseTransaction, tenantId: string, accountId: string) {
    const rows = await tx.execute<{
      flowId: string;
      versionId: string;
      trigger: AutomationTrigger;
    }>(sql`
      SELECT f.id AS "flowId",v.id AS "versionId",v.trigger_config AS trigger
      FROM app.automation_flows f JOIN app.automation_versions v ON v.tenant_id=f.tenant_id AND v.flow_id=f.id
        AND v.id=f.published_version_id AND v.status='PUBLISHED'
      WHERE f.tenant_id=${tenantId}::uuid AND f.is_deleted=false AND f.status='ACTIVE'
        AND v.trigger_config->>'accountId'=${accountId} ORDER BY f.id`);
    return rows.rows;
  }
  async nodeIds(tx: AppDatabaseTransaction, tenantId: string, versionId: string) {
    const rows = await tx.execute<{
      id: string;
      key: string;
    }>(sql`SELECT n.id,n.node_key AS key FROM app.automation_nodes n
      JOIN app.automation_versions v ON v.tenant_id=n.tenant_id AND v.id=n.version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE n.tenant_id=${tenantId}::uuid AND n.version_id=${versionId}::uuid`);
    return new Map(rows.rows.map((row) => [row.key, row.id]));
  }
  async create(
    tx: AppDatabaseTransaction,
    input: {
      id: string;
      tenantId: string;
      versionId: string;
      conversationId: string;
      nodeId: string;
      eventKey: string;
      state: AutomationRunState;
    },
  ) {
    await tx.execute(sql`INSERT INTO app.automation_runs (id,tenant_id,flow_version_id,conversation_id,current_node_id,status,state,last_event_key,started_at)
      VALUES (${input.id}::uuid,${input.tenantId}::uuid,${input.versionId}::uuid,${input.conversationId}::uuid,${input.nodeId}::uuid,'RUNNING',${JSON.stringify(input.state)}::jsonb,${input.eventKey},clock_timestamp())`);
  }
  async update(
    tx: AppDatabaseTransaction,
    run: AutomationRun,
    status: RunStatus,
    nodeId: string | null,
    state: AutomationRunState,
    eventKey = run.lastEventKey,
  ) {
    const result =
      await tx.execute(sql`UPDATE app.automation_runs SET status=${status},current_node_id=${nodeId}::uuid,
      state=${JSON.stringify(state)}::jsonb,last_event_key=${eventKey},lock_version=lock_version+1,updated_at=clock_timestamp(),
      completed_at=CASE WHEN ${status} IN ('COMPLETED','FAILED','CANCELLED') THEN clock_timestamp() ELSE NULL END
      WHERE tenant_id=${run.tenantId}::uuid AND id=${run.id}::uuid AND lock_version=${run.lockVersion}
      AND (${nodeId}::uuid IS NULL OR EXISTS(SELECT 1 FROM app.automation_nodes n
        WHERE n.tenant_id=${run.tenantId}::uuid AND n.version_id=${run.flowVersionId}::uuid AND n.id=${nodeId}::uuid)) RETURNING id`);
    if (result.rows.length !== 1) throw new Error("AUTOMATION_RUN_REVISION_CHANGED");
  }
  async state(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    state: "NONE" | "ACTIVE" | "PAUSED" | "HANDED_OFF",
  ) {
    await tx.execute(sql`UPDATE app.conversations SET automation_state=${state},updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${conversationId}::uuid`);
  }
  async assign(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    userId: string,
  ) {
    await tx.execute(sql`UPDATE app.conversations SET assigned_user_id=${userId}::uuid,updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${conversationId}::uuid`);
  }
  async contactUpdate(
    tx: AppDatabaseTransaction,
    tenantId: string,
    contactId: string,
    fields: Readonly<Record<string, string>>,
  ) {
    await tx.execute(sql`UPDATE app.contacts SET name=coalesce(${fields.name ?? null},name),email=coalesce(${fields.email ?? null},email),
      company=coalesce(${fields.company ?? null},company),address=coalesce(${fields.address ?? null},address),updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${contactId}::uuid AND is_deleted=false`);
  }
  async authorization(tx: AppDatabaseTransaction, tenantId: string, actorId: string) {
    const rows = await tx.execute<{
      actorId: string;
      roleId: string;
      roleName: string;
      permissions: string[];
    }>(sql`
      SELECT u.id AS "actorId",r.id AS "roleId",r.name AS "roleName",array_agg(p.permission_key) AS permissions
      FROM app.users u JOIN app.user_tenant_scopes s ON s.user_id=u.id AND s.tenant_id=u.home_tenant_id AND s.role_id=u.role_id AND s.is_deleted=false
      JOIN app.roles r ON r.id=u.role_id AND r.tenant_id=s.tenant_id AND r.system_key='TENANT_ADMIN' AND r.is_deleted=false
      JOIN app.tenants t ON t.id=s.tenant_id AND t.is_deleted=false AND t.status='ACTIVE'
      JOIN app.role_permissions rp ON rp.role_id=r.id JOIN app.permissions p ON p.id=rp.permission_id
      WHERE u.id=${actorId}::uuid AND u.home_tenant_id=${tenantId}::uuid AND u.status='ACTIVE' AND u.is_deleted=false
      GROUP BY u.id,r.id,r.name`);
    return rows.rows[0];
  }
  async message(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await tx.execute<{
      providerId: string | null;
      status: string;
      errorCode: string | null;
    }>(sql`
      SELECT provider_message_id AS "providerId",status,error_code AS "errorCode" FROM app.messages WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`);
    return rows.rows[0];
  }
}
function runProjection() {
  return sql`r.id,r.tenant_id AS "tenantId",r.flow_version_id AS "flowVersionId",r.conversation_id AS "conversationId",
    r.current_node_id AS "currentNodeId",r.status,r.state,r.last_event_key AS "lastEventKey",r.lock_version AS "lockVersion"`;
}
