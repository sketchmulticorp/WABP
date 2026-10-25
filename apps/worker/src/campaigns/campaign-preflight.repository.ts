import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  PreflightContact,
  PreflightContext,
  RecipientSnapshot,
} from "./campaign-preflight.types.js";

@Injectable()
export class CampaignPreflightRepository {
  async claim(client: PoolClient, runId: string): Promise<PreflightContext | undefined> {
    // Match API lock order (campaign then run), preventing edit/preflight deadlocks.
    await client.query(
      `SELECT c.id FROM app.campaigns c JOIN app.campaign_preflight_runs r ON r.tenant_id=c.tenant_id AND r.campaign_id=c.id WHERE r.id=$1 AND c.is_deleted=false FOR UPDATE OF c`,
      [runId],
    );
    const claimed = await client.query<{ id: string }>(
      `UPDATE app.campaign_preflight_runs SET status='PROCESSING',started_at=COALESCE(started_at,now())
       WHERE id=$1 AND status IN ('QUEUED','PROCESSING') RETURNING id`,
      [runId],
    );
    if (claimed.rows[0] === undefined) return undefined;
    const result = await client.query<PreflightContext>(
      `SELECT r.id AS "runId",r.tenant_id AS "tenantId",r.campaign_id AS "campaignId",
        r.requested_by AS "requestedBy",r.request_id AS "requestId",r.content_version AS "contentVersion",
        c.content_version AS "currentContentVersion",c.status AS "campaignStatus",
        c.template_content_version AS "pinnedTemplateVersion",c.started_at AS "campaignStartedAt",
        c.approval_status AS "campaignApprovalStatus",c.approved_version AS "campaignApprovedVersion",
        c.audience_definition AS "audienceDefinition",c.variable_mapping AS "variableMapping",
        t.status AS "tenantStatus",a.status AS "accountStatus",pc.status AS "credentialStatus",
        tpl.provider_status AS "templateProviderStatus",tpl.approval_status AS "templateApprovalStatus",
        tpl.content_version AS "templateContentVersion",tpl.approved_version AS "templateApprovedVersion",
        tpl.components AS "templateComponents",s.status AS "subscriptionStatus",p.status AS "planStatus",
        p.limits AS "planLimits",
        COALESCE((SELECT SUM(u.quantity)::bigint FROM app.usage_events u
          WHERE u.tenant_id=r.tenant_id AND u.event_type='OUTBOUND_MESSAGE_RESERVED'
            AND u.occurred_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
            AND u.occurred_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC'),0)::int AS "monthlyUsed"
       FROM app.campaign_preflight_runs r
       JOIN app.campaigns c ON c.tenant_id=r.tenant_id AND c.id=r.campaign_id AND c.is_deleted=false
       JOIN app.tenants t ON t.id=r.tenant_id AND t.is_deleted=false
       JOIN app.whatsapp_accounts a ON a.tenant_id=r.tenant_id AND a.id=c.whatsapp_account_id
       LEFT JOIN app.provider_credentials pc ON pc.tenant_id=r.tenant_id AND pc.whatsapp_account_id=a.id
       JOIN app.templates tpl ON tpl.tenant_id=r.tenant_id AND tpl.id=c.template_id AND tpl.whatsapp_account_id=c.whatsapp_account_id AND tpl.is_deleted=false
       LEFT JOIN LATERAL (
         SELECT (array_agg(sx.status ORDER BY sx.starts_at DESC))[1] AS status,
           (array_agg(sx.plan_id ORDER BY sx.starts_at DESC))[1] AS plan_id
         FROM app.subscriptions sx WHERE sx.tenant_id=r.tenant_id
           AND sx.starts_at<=now() AND (sx.ends_at IS NULL OR sx.ends_at>now())
           AND sx.status IN ('ACTIVE','CANCELLED','EXPIRED','PAST_DUE','SUSPENDED','TRIAL')
         HAVING COUNT(*)=1
       ) s ON true
       LEFT JOIN app.plans p ON p.id=s.plan_id
       WHERE r.id=$1 FOR UPDATE OF r,c`,
      [runId],
    );
    if (result.rows[0] === undefined)
      await this.fail(runId, client, "CAMPAIGN_PREFLIGHT_TARGET_UNAVAILABLE");
    return result.rows[0];
  }

  async contacts(
    client: PoolClient,
    context: PreflightContext,
  ): Promise<readonly PreflightContact[]> {
    const result = await client.query<PreflightContact>(
      `WITH direct_selection AS (
         SELECT value::uuid AS contact_id FROM jsonb_array_elements_text($2::jsonb->'contactIds') value
       ), group_selection AS (
         SELECT m.contact_id FROM app.contact_group_members m
         JOIN app.contact_groups g ON g.tenant_id=m.tenant_id AND g.id=m.group_id AND g.is_deleted=false
         WHERE m.tenant_id=$1 AND m.is_deleted=false
           AND m.group_id IN (SELECT value::uuid FROM jsonb_array_elements_text($2::jsonb->'groupIds') value)
       ), selected AS (SELECT contact_id FROM direct_selection UNION ALL SELECT contact_id FROM group_selection)
       SELECT c.id,c.phone_e164 AS "phoneE164",c.name,c.email,c.consent_status AS "consentStatus",
         COUNT(*)::int AS "selectionCount"
       FROM selected s JOIN app.contacts c ON c.tenant_id=$1 AND c.id=s.contact_id AND c.is_deleted=false
       GROUP BY c.id,c.phone_e164,c.name,c.email,c.consent_status ORDER BY c.id`,
      [context.tenantId, JSON.stringify(context.audienceDefinition)],
    );
    return result.rows;
  }

  async groupMembershipCount(client: PoolClient, context: PreflightContext): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM app.contact_group_members m
       JOIN app.contact_groups g ON g.tenant_id=m.tenant_id AND g.id=m.group_id AND g.is_deleted=false
       JOIN app.contacts c ON c.tenant_id=m.tenant_id AND c.id=m.contact_id AND c.is_deleted=false
       WHERE m.tenant_id=$1 AND m.is_deleted=false
         AND m.group_id IN (SELECT value::uuid FROM jsonb_array_elements_text($2::jsonb->'groupIds') value)`,
      [context.tenantId, JSON.stringify(context.audienceDefinition)],
    );
    return result.rows[0]?.count ?? 0;
  }

  async replaceRecipients(
    client: PoolClient,
    context: PreflightContext,
    recipients: readonly RecipientSnapshot[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM app.campaign_recipients WHERE tenant_id=$1 AND campaign_id=$2`,
      [context.tenantId, context.campaignId],
    );
    for (let offset = 0; offset < recipients.length; offset += 1_000) {
      const batch = recipients.slice(offset, offset + 1_000);
      await client.query(
        `INSERT INTO app.campaign_recipients
          (tenant_id,campaign_id,preflight_run_id,content_version,contact_id,status,rendered_variables,skip_or_error_code)
         SELECT $1,$2,$3,$4,v.contact_id,v.status,v.rendered_variables,v.skip_or_error_code
         FROM jsonb_to_recordset($5::jsonb) v(contact_id uuid,status text,rendered_variables jsonb,skip_or_error_code text)`,
        [
          context.tenantId,
          context.campaignId,
          context.runId,
          context.contentVersion,
          JSON.stringify(
            batch.map((row) => ({
              contact_id: row.contactId,
              status: row.status,
              rendered_variables: row.renderedVariables,
              skip_or_error_code: row.skipOrErrorCode,
            })),
          ),
        ],
      );
    }
  }

  async complete(
    client: PoolClient,
    context: PreflightContext,
    blockers: readonly string[],
    estimates: object,
  ) {
    await client.query(
      `UPDATE app.campaign_preflight_runs SET status='COMPLETED',blockers=$2::jsonb,estimates=$3::jsonb,
       error_code=NULL,completed_at=now() WHERE id=$1 AND status='PROCESSING'`,
      [context.runId, JSON.stringify(blockers), JSON.stringify(estimates)],
    );
    await client.query(
      `INSERT INTO app.audit_logs (tenant_id,actor_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
       SELECT $1,$2,r.system_key,'CAMPAIGN_PREFLIGHT_COMPLETED','campaign',$3,'SUCCESS',
         jsonb_build_object('preflight_run_id',$4::text,'content_version',$5::integer,'blocker_count',$6::integer),$7
       FROM app.users u JOIN app.roles r ON r.id=u.role_id WHERE u.id=$2 AND u.is_deleted=false AND r.is_deleted=false`,
      [
        context.tenantId,
        context.requestedBy,
        context.campaignId,
        context.runId,
        context.contentVersion,
        blockers.length,
        context.requestId,
      ],
    );
  }

  async fail(runId: string, client: PoolClient, code: string) {
    await client.query(
      `UPDATE app.campaign_preflight_runs SET status='FAILED',error_code=$2,completed_at=now()
       WHERE id=$1 AND status IN ('QUEUED','PROCESSING')`,
      [runId, code],
    );
  }
  async supersede(runId: string, client: PoolClient) {
    await client.query(
      `UPDATE app.campaign_preflight_runs SET status='SUPERSEDED',error_code='CAMPAIGN_VERSION_CHANGED',completed_at=now()
       WHERE id=$1 AND status IN ('QUEUED','PROCESSING')`,
      [runId],
    );
  }
}
