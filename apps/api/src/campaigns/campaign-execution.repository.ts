import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  campaignsInApp as campaigns,
  campaignRecipientsInApp as recipients,
  campaignPreflightRunsInApp as runs,
  conversationsInApp as conversations,
} from "../database/schema/index.js";

@Injectable()
export class CampaignExecutionRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async candidates() {
    const result = await this.database.execute<{ id: string; tenantId: string }>(
      sql`select id,tenant_id as "tenantId" from app.campaigns where is_deleted=false and (status in ('QUEUED','RUNNING') or (status='SCHEDULED' and schedule_at<=now())) order by updated_at limit 10`,
    );
    return result.rows;
  }
  async lock(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await tx
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id), eq(campaigns.isDeleted, false)),
      )
      .for("update");
    return rows[0];
  }
  async authorization(tx: AppDatabaseTransaction, tenantId: string, actorId: string) {
    const result = await tx.execute<{
      actorId: string;
      roleId: string;
      roleName: string;
      roleSystemKey: string;
      permissions: string[];
    }>(sql`
      select u.id as "actorId",r.id as "roleId",r.name as "roleName",r.system_key as "roleSystemKey",
        coalesce(array_agg(p.permission_key) filter(where p.permission_key is not null),'{}') as permissions
      from app.users u join app.user_tenant_scopes s on s.user_id=u.id and s.tenant_id=${tenantId} and s.is_deleted=false
      join app.roles r on r.id=u.role_id and s.role_id=u.role_id and r.is_deleted=false and r.tenant_id=${tenantId}
      join app.tenants t on t.id=s.tenant_id and t.is_deleted=false and t.status='ACTIVE'
      left join app.role_permissions rp on rp.role_id=r.id left join app.permissions p on p.id=rp.permission_id
      where u.id=${actorId} and u.is_deleted=false and u.status='ACTIVE' and u.home_tenant_id=${tenantId}
      group by u.id,r.id,r.name,r.system_key`);
    return result.rows[0];
  }
  async liveTemplate(tx: AppDatabaseTransaction, tenantId: string, id: string, accountId: string) {
    const result = await tx.execute<{ contentVersion: number }>(
      sql`select content_version as "contentVersion" from app.templates where tenant_id=${tenantId} and id=${id} and whatsapp_account_id=${accountId} and is_deleted=false for share`,
    );
    return result.rows[0];
  }
  async run(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const rows = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.tenantId, tenantId), eq(runs.id, id)))
      .limit(1);
    return rows[0];
  }
  async createRun(
    tx: AppDatabaseTransaction,
    campaign: {
      id: string;
      tenantId: string;
      contentVersion: number;
      deliveryRequestedBy: string | null;
    },
  ) {
    await tx
      .update(runs)
      .set({ status: "SUPERSEDED", completedAt: new Date().toISOString() })
      .where(
        and(
          eq(runs.tenantId, campaign.tenantId),
          eq(runs.campaignId, campaign.id),
          sql`${runs.status} in ('QUEUED','PROCESSING')`,
        ),
      );
    const [run] = await tx
      .insert(runs)
      .values({
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        contentVersion: campaign.contentVersion,
        status: "QUEUED",
        requestedBy: campaign.deliveryRequestedBy ?? "",
        requestId: `campaign:${campaign.id}`,
      })
      .returning({ id: runs.id });
    if (run === undefined) throw new Error("Preflight run not persisted");
    await tx
      .update(campaigns)
      .set({ finalPreflightId: run.id, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(campaigns.tenantId, campaign.tenantId),
          eq(campaigns.id, campaign.id),
          eq(campaigns.isDeleted, false),
        ),
      );
    return run.id;
  }
  async pending(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    return tx
      .select({
        id: recipients.id,
        contactId: recipients.contactId,
        renderedVariables: recipients.renderedVariables,
      })
      .from(recipients)
      .where(
        and(
          eq(recipients.tenantId, tenantId),
          eq(recipients.campaignId, id),
          eq(recipients.status, "PENDING"),
          sql`${recipients.messageId} is null`,
        ),
      )
      .orderBy(recipients.id)
      .limit(25);
  }
  async remainingQuota(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`message-quota:${tenantId}:${start.toISOString()}`},0))`,
    );
    const result = await tx.execute<{ remaining: string; needed: string }>(sql`
      select (case when jsonb_typeof(p.limits->'monthly_message_limit')='number' then (p.limits->>'monthly_message_limit')::numeric else 0 end)-coalesce((select sum(quantity) from app.usage_events where tenant_id=${tenantId} and event_type='OUTBOUND_MESSAGE_RESERVED' and occurred_at>=${start.toISOString()}::timestamptz and occurred_at<${start.toISOString()}::timestamptz+interval '1 month'),0) as remaining,
        (select count(*) from app.campaign_recipients where tenant_id=${tenantId} and campaign_id=${id} and status='PENDING' and message_id is null) as needed
      from app.subscriptions s join app.plans p on p.id=s.plan_id and p.status='ACTIVE'
      where s.tenant_id=${tenantId} and s.status in ('ACTIVE','TRIAL') and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now())`);
    return result.rows.length === 1 ? result.rows[0] : undefined;
  }
  async lockMessageKeys(tx: AppDatabaseTransaction, tenantId: string, keys: readonly string[]) {
    for (const key of [...keys].sort())
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`message-key:${tenantId}:${key}`},0))`,
      );
  }
  async conversation(
    tx: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
    contactId: string,
  ) {
    await tx
      .insert(conversations)
      .values({ tenantId, whatsappAccountId: accountId, contactId, status: "OPEN" })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.whatsappAccountId, accountId),
          eq(conversations.contactId, contactId),
        ),
      )
      .limit(1);
    if (row === undefined) throw new Error("Conversation unavailable");
    return row.id;
  }
  async link(tx: AppDatabaseTransaction, tenantId: string, id: string, messageId: string) {
    await tx
      .update(recipients)
      .set({ messageId, status: "QUEUED", updatedAt: new Date().toISOString() })
      .where(and(eq(recipients.tenantId, tenantId), eq(recipients.id, id)));
  }
  async state(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    status: string,
    reason: string | null = null,
  ) {
    await tx
      .update(campaigns)
      .set({
        status,
        pauseReason: reason,
        updatedAt: new Date().toISOString(),
        ...(status === "RUNNING" ? { startedAt: sql`coalesce(started_at,now())` } : {}),
        ...(["COMPLETED", "CANCELLED", "FAILED"].includes(status)
          ? { completedAt: new Date().toISOString() }
          : {}),
      })
      .where(
        and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id), eq(campaigns.isDeleted, false)),
      );
    await tx.execute(
      sql`insert into app.audit_logs(tenant_id,actor_role,action,entity_type,entity_id,result,metadata,request_id) values (${tenantId},'SYSTEM',${`CAMPAIGN_${status}`},'campaign',${id},'SUCCESS',${JSON.stringify({ reason })}::jsonb,${`campaign:${id}`})`,
    );
  }
  async outstanding(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    const result = await tx.execute<{ count: number }>(
      sql`select count(*)::int as count from app.campaign_recipients r left join app.messages m on m.tenant_id=r.tenant_id and m.id=r.message_id where r.tenant_id=${tenantId} and r.campaign_id=${id} and (r.status='PENDING' or m.status in ('CREATED','QUEUED','SENDING'))`,
    );
    return result.rows[0]?.count ?? 0;
  }
  async touch(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    await tx
      .update(campaigns)
      .set({ updatedAt: new Date().toISOString() })
      .where(
        and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id), eq(campaigns.isDeleted, false)),
      );
  }
}
