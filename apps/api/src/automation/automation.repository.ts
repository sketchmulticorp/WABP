import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  AutomationGraph,
  AutomationNode,
  AutomationSummary,
} from "@whatsapp-platform/contracts";
import { APP_DATABASE } from "../database/database.constants.js";
import type {
  AppDatabase,
  AppDatabaseExecutor,
  AppDatabaseTransaction,
} from "../database/database.types.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type {
  AutomationRecord,
  AutomationTrigger,
  StoredAutomationVersion,
} from "./automation.types.js";
type Row<T> = { [K in keyof T]: T[K] };

/** SQL ownership only. Callers supply the transaction and decide publication/workflow policy. */
@Injectable()
export class AutomationRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async entitlement(tx: AppDatabaseTransaction, tenantId: string) {
    const rows = await tx.execute<{
      status: string;
      planStatus: string;
      flags: Record<string, unknown>;
    }>(sql`
      SELECT s.status,p.status AS "planStatus",p.feature_flags AS flags FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id
      WHERE s.tenant_id=${tenantId}::uuid AND s.starts_at<=now() AND (s.ends_at IS NULL OR s.ends_at>now()) LIMIT 2`);
    return rows.rows.length === 1 ? rows.rows[0] : undefined;
  }

  async options(tenantId: string, accountCursor: string | null, memberCursor: string | null) {
    const accounts = await this.database.execute<{ id: string; label: string; status: string }>(sql`
      SELECT id,coalesce(display_name,display_phone) AS label,status FROM app.whatsapp_accounts
      WHERE tenant_id=${tenantId}::uuid AND (${accountCursor}::uuid IS NULL OR id>${accountCursor}::uuid) ORDER BY id LIMIT 51`);
    const members = await this.database.execute<{ id: string; label: string }>(sql`
      SELECT u.id,u.display_name AS label FROM app.users u
      JOIN app.user_tenant_scopes s ON s.user_id=u.id AND s.tenant_id=u.home_tenant_id AND s.role_id=u.role_id AND s.is_deleted=false
      JOIN app.roles r ON r.id=u.role_id AND r.tenant_id=s.tenant_id AND r.is_deleted=false AND r.system_key IN ('TENANT_ADMIN','TENANT_USER')
      WHERE u.home_tenant_id=${tenantId}::uuid AND u.status='ACTIVE' AND u.is_deleted=false
      AND (${memberCursor}::uuid IS NULL OR u.id>${memberCursor}::uuid) ORDER BY u.id LIMIT 51`);
    return { accounts: accounts.rows, members: members.rows };
  }

  async list(tenantId: string, after: string | null) {
    const result = await this.database.execute<Row<AutomationSummary>>(sql`
      SELECT ${flowProjection()} FROM app.automation_flows f
      WHERE f.tenant_id=${tenantId}::uuid AND f.is_deleted=false
      AND (${after}::uuid IS NULL OR f.id > ${after}::uuid) ORDER BY f.id LIMIT 51`);
    return result.rows;
  }
  async serialize(tx: AppDatabaseTransaction, tenantId: string) {
    // Serializes name and active-keyword uniqueness checks without a new trigger table.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`automation-authoring:${tenantId}`},0))`,
    );
  }
  async find(
    tenantId: string,
    id: string,
    tx?: AppDatabaseTransaction,
    onlyVersionId?: string,
  ): Promise<AutomationRecord | undefined> {
    const executor = tx ?? this.database;
    const rows = await executor.execute<Row<AutomationSummary>>(sql`
      SELECT ${flowProjection()} FROM app.automation_flows f
      WHERE f.tenant_id=${tenantId}::uuid AND f.id=${id}::uuid AND f.is_deleted=false
      ${tx === undefined ? sql`` : sql`FOR UPDATE OF f`}`);
    const flow = rows.rows[0];
    if (flow === undefined) return undefined;
    const versions = await executor.execute<{
      id: string;
      number: number;
      status: StoredAutomationVersion["status"];
      publishedAt: string | null;
      trigger: Partial<AutomationTrigger>;
    }>(sql`
      SELECT v.id,v.version_no AS number,v.status,v.published_at::text AS "publishedAt",v.trigger_config AS trigger
      FROM app.automation_versions v JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE v.tenant_id=${tenantId}::uuid AND v.flow_id=${id}::uuid
        AND (${onlyVersionId ?? null}::uuid IS NULL OR v.id=${onlyVersionId ?? null}::uuid) ORDER BY v.version_no DESC`);
    const snapshots: StoredAutomationVersion[] = [];
    for (const version of versions.rows) {
      const graph = await this.graph(executor, tenantId, version.id);
      snapshots.push({
        id: version.id,
        number: version.number,
        status: version.status,
        publishedAt: version.publishedAt,
        publishedBy: version.trigger.publishedBy ?? null,
        graph: {
          ...graph,
          accountId: version.trigger.accountId ?? "",
          keywords: version.trigger.keywords ?? [],
        },
      });
    }
    return { ...flow, versions: snapshots };
  }
  async graph(executor: AppDatabaseExecutor, tenantId: string, versionId: string) {
    const nodes = await executor.execute<Row<AutomationNode>>(sql`
      SELECT n.node_key AS key,n.node_type AS type,n.config
      FROM app.automation_nodes n JOIN app.automation_versions v ON v.tenant_id=n.tenant_id AND v.id=n.version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE n.tenant_id=${tenantId}::uuid AND n.version_id=${versionId}::uuid ORDER BY n.node_key`);
    const edges = await executor.execute<{ from: string; to: string; choice: string | null }>(sql`
      SELECT a.node_key AS "from",b.node_key AS "to",e.condition->>'choice' AS choice
      FROM app.automation_edges e
      JOIN app.automation_nodes a ON a.tenant_id=e.tenant_id AND a.version_id=e.version_id AND a.id=e.from_node_id
      JOIN app.automation_nodes b ON b.tenant_id=e.tenant_id AND b.version_id=e.version_id AND b.id=e.to_node_id
      JOIN app.automation_versions v ON v.tenant_id=e.tenant_id AND v.id=e.version_id
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false
      WHERE e.tenant_id=${tenantId}::uuid AND e.version_id=${versionId}::uuid ORDER BY e.priority,e.id`);
    return { nodes: nodes.rows, edges: edges.rows };
  }
  async nameExists(
    tx: AppDatabaseTransaction,
    tenantId: string,
    name: string,
    except: string | null,
  ) {
    const result =
      await tx.execute(sql`SELECT id FROM app.automation_flows WHERE tenant_id=${tenantId}::uuid
      AND name=${name} AND is_deleted=false AND (${except}::uuid IS NULL OR id<>${except}::uuid)`);
    return result.rows.length > 0;
  }
  async create(
    tx: AppDatabaseTransaction,
    context: AuthorizationContext,
    tenantId: string,
    id: string,
    name: string,
  ) {
    await tx.execute(sql`INSERT INTO app.automation_flows (id,tenant_id,name,status,created_by)
      VALUES (${id}::uuid,${tenantId}::uuid,${name},'DRAFT',${context.actorId}::uuid)`);
  }
  async appendDraft(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    name: string,
    graph: AutomationGraph,
  ) {
    const versionId = randomUUID();
    await tx.execute(
      sql`UPDATE app.automation_versions SET status='RETIRED' WHERE tenant_id=${tenantId}::uuid AND flow_id=${id}::uuid AND status='DRAFT'`,
    );
    const trigger: AutomationTrigger = {
      schemaVersion: 1,
      accountId: graph.accountId,
      keywords: graph.keywords,
      publishedBy: null,
    };
    await tx.execute(sql`INSERT INTO app.automation_versions (id,tenant_id,flow_id,version_no,status,trigger_config)
      SELECT ${versionId}::uuid,${tenantId}::uuid,${id}::uuid,coalesce(max(version_no),0)+1,'DRAFT',${JSON.stringify(trigger)}::jsonb
      FROM app.automation_versions WHERE tenant_id=${tenantId}::uuid AND flow_id=${id}::uuid`);
    const nodeIds = new Map<string, string>();
    for (const node of graph.nodes) {
      const nodeId = randomUUID();
      nodeIds.set(node.key, nodeId);
      await tx.execute(sql`INSERT INTO app.automation_nodes (id,tenant_id,version_id,node_key,node_type,config)
        VALUES (${nodeId}::uuid,${tenantId}::uuid,${versionId}::uuid,${node.key},${node.type},${JSON.stringify(node.config)}::jsonb)`);
    }
    for (const [priority, edge] of graph.edges.entries()) {
      await tx.execute(sql`INSERT INTO app.automation_edges (tenant_id,version_id,from_node_id,to_node_id,condition,priority)
        VALUES (${tenantId}::uuid,${versionId}::uuid,${nodeIds.get(edge.from)}::uuid,${nodeIds.get(edge.to)}::uuid,${JSON.stringify({ choice: edge.choice })}::jsonb,${priority})`);
    }
    await tx.execute(sql`UPDATE app.automation_flows SET name=${name},updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND is_deleted=false`);
    return versionId;
  }
  async accountExists(tx: AppDatabaseTransaction, tenantId: string, accountId: string) {
    const result = await tx.execute(
      sql`SELECT id FROM app.whatsapp_accounts WHERE tenant_id=${tenantId}::uuid AND id=${accountId}::uuid`,
    );
    return result.rows.length > 0;
  }
  async memberExists(tx: AppDatabaseTransaction, tenantId: string, userId: string) {
    const result = await tx.execute(sql`SELECT u.id FROM app.users u
      JOIN app.user_tenant_scopes s ON s.user_id=u.id AND s.tenant_id=u.home_tenant_id AND s.role_id=u.role_id AND s.is_deleted=false
      JOIN app.roles r ON r.id=u.role_id AND r.tenant_id=s.tenant_id AND r.is_deleted=false AND r.system_key IN ('TENANT_ADMIN','TENANT_USER')
      WHERE u.id=${userId}::uuid AND u.home_tenant_id=${tenantId}::uuid AND u.status='ACTIVE' AND u.is_deleted=false`);
    return result.rows.length > 0;
  }
  async activeTriggers(tx: AppDatabaseTransaction, tenantId: string, except: string) {
    const result = await tx.execute<{ trigger: AutomationTrigger }>(sql`
      SELECT v.trigger_config AS trigger FROM app.automation_flows f
      JOIN app.automation_versions v ON v.tenant_id=f.tenant_id AND v.flow_id=f.id AND v.id=f.published_version_id AND v.status='PUBLISHED'
      WHERE f.tenant_id=${tenantId}::uuid AND f.id<>${except}::uuid AND f.is_deleted=false AND f.status='ACTIVE'`);
    return result.rows.map((row) => row.trigger);
  }
  async publish(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    versionId: string,
    actorId: string,
  ) {
    await tx.execute(sql`UPDATE app.automation_versions SET status='PUBLISHED',published_at=clock_timestamp(),
      trigger_config=jsonb_set(trigger_config,'{publishedBy}',to_jsonb(${actorId}::text))
      WHERE tenant_id=${tenantId}::uuid AND flow_id=${id}::uuid AND id=${versionId}::uuid AND status='DRAFT'`);
    await tx.execute(sql`UPDATE app.automation_flows SET status='ACTIVE',published_version_id=${versionId}::uuid,updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND is_deleted=false`);
  }
  async setStatus(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    status: "ACTIVE" | "PAUSED",
  ) {
    await tx.execute(sql`UPDATE app.automation_flows SET status=${status},updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND is_deleted=false`);
  }
  async audit(
    tx: AppDatabaseTransaction,
    context: AuthorizationContext,
    tenantId: string,
    id: string,
    action: string,
  ) {
    await tx.execute(sql`INSERT INTO app.audit_logs (tenant_id,actor_id,actor_role,action,entity_type,entity_id,result,request_id)
      VALUES (${tenantId}::uuid,${context.actorId}::uuid,${context.roleSystemKey},${action},'automation',${id},'SUCCESS',${context.requestId})`);
  }
}

function flowProjection() {
  return sql`f.id,f.name,f.status,f.published_version_id AS "publishedVersionId",f.updated_at::text AS "updatedAt"`;
}
