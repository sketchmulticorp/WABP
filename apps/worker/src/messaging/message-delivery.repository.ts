import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { DeliveryFailure, DeliverySnapshot } from "./message-delivery.types.js";

@Injectable()
export class MessageDeliveryRepository {
  async findForDispatch(
    session: PoolClient,
    messageId: string,
  ): Promise<DeliverySnapshot | undefined> {
    // Automation uses flow -> Conversation -> Message, coordinating pause and human takeover
    // with the durable SENDING claim, without holding locks during the provider request.
    await session.query(
      `SELECT f.id FROM app.messages m
      JOIN app.automation_runs r ON r.tenant_id=m.tenant_id AND r.id::text=m.policy_decision->'automation'->>'runId' AND r.conversation_id=m.conversation_id
      JOIN app.automation_versions av ON av.tenant_id=r.tenant_id AND av.id=r.flow_version_id
      JOIN app.automation_flows f ON f.tenant_id=av.tenant_id AND f.id=av.flow_id AND f.is_deleted=false
      WHERE m.id=$1 AND m.policy_decision->>'source'='AUTOMATION' FOR UPDATE OF f`,
      [messageId],
    );
    await session.query(
      `SELECT c.id FROM app.messages m JOIN app.conversations c ON c.tenant_id=m.tenant_id AND c.id=m.conversation_id
      WHERE m.id=$1 AND m.policy_decision->>'source'='AUTOMATION' FOR UPDATE OF c`,
      [messageId],
    );
    // Use campaign -> message lock order, shared with pause/cancel and composition.
    await session.query(
      `SELECT c.id FROM app.messages m JOIN app.campaigns c ON c.tenant_id=m.tenant_id AND c.id=m.campaign_id AND c.is_deleted=false WHERE m.id=$1 FOR UPDATE OF c`,
      [messageId],
    );
    const result = await session.query<DeliverySnapshot>(
      `SELECT m.*, t.status AS tenant_status, c.phone_e164, c.consent_status,
        v.window_expires_at, a.status AS account_status, a.phone_number_id,
        pc.status AS credential_status, pc.secret_ref,
        s.status AS subscription_status, p.status AS plan_status,
        to_jsonb(tp) AS template,
        (SELECT jsonb_build_object('runStatus',ar.status,'flowStatus',af.status,'conversationState',v.automation_state,
          'versionId',av.id,'publisherId',av.trigger_config->>'publishedBy','accountId',av.trigger_config->>'accountId','entitled',p.feature_flags->'automation_enabled'='true'::jsonb,
          'publisherActive',EXISTS(SELECT 1 FROM app.users au
            JOIN app.user_tenant_scopes aus ON aus.user_id=au.id AND aus.tenant_id=au.home_tenant_id AND aus.role_id=au.role_id AND aus.is_deleted=false
            JOIN app.roles aur ON aur.id=au.role_id AND aur.tenant_id=aus.tenant_id AND aur.system_key='TENANT_ADMIN' AND aur.is_deleted=false
            JOIN app.role_permissions arp ON arp.role_id=aur.id JOIN app.permissions ap ON ap.id=arp.permission_id AND ap.permission_key='automation.publish'
            WHERE au.id::text=av.trigger_config->>'publishedBy' AND au.home_tenant_id=m.tenant_id AND au.status='ACTIVE' AND au.is_deleted=false))
          FROM app.automation_runs ar JOIN app.automation_versions av ON av.tenant_id=ar.tenant_id AND av.id=ar.flow_version_id AND av.status='PUBLISHED'
          JOIN app.automation_flows af ON af.tenant_id=av.tenant_id AND af.id=av.flow_id AND af.is_deleted=false
          WHERE ar.tenant_id=m.tenant_id AND ar.id::text=m.policy_decision->'automation'->>'runId' AND ar.conversation_id=m.conversation_id) AS automation,
        jsonb_build_object('status',cg.status,'contentVersion',cg.content_version,'approvalStatus',cg.approval_status,
          'approvedVersion',cg.approved_version,'templateContentVersion',cg.template_content_version,
          'reviewerActive',EXISTS(SELECT 1 FROM app.users ru JOIN app.user_tenant_scopes rs ON rs.user_id=ru.id AND rs.tenant_id=m.tenant_id AND rs.is_deleted=false JOIN app.roles rr ON rr.id=ru.role_id AND rs.role_id=ru.role_id AND rr.is_deleted=false AND rr.system_key='TENANT_ADMIN' AND rr.tenant_id=m.tenant_id JOIN app.role_permissions rp ON rp.role_id=rr.id JOIN app.permissions pr ON pr.id=rp.permission_id AND pr.permission_key='campaign.approve' WHERE ru.id=cg.reviewed_by AND ru.is_deleted=false AND ru.status='ACTIVE' AND ru.home_tenant_id=m.tenant_id),
          'senderActive',EXISTS(SELECT 1 FROM app.users su JOIN app.user_tenant_scopes ss ON ss.user_id=su.id AND ss.tenant_id=m.tenant_id AND ss.is_deleted=false JOIN app.roles sr ON sr.id=su.role_id AND ss.role_id=su.role_id AND sr.is_deleted=false AND sr.system_key IN ('TENANT_ADMIN','TENANT_USER') AND sr.tenant_id=m.tenant_id JOIN app.role_permissions sp ON sp.role_id=sr.id JOIN app.permissions pp ON pp.id=sp.permission_id AND pp.permission_key='campaign.send' WHERE su.id=cg.delivery_requested_by AND su.is_deleted=false AND su.status='ACTIVE' AND su.home_tenant_id=m.tenant_id)) AS campaign
       FROM app.messages m
       LEFT JOIN app.tenants t ON t.id=m.tenant_id AND t.is_deleted=FALSE
       LEFT JOIN app.contacts c ON c.tenant_id=m.tenant_id AND c.id=m.contact_id AND c.is_deleted=FALSE
       JOIN app.conversations v ON v.tenant_id=m.tenant_id AND v.id=m.conversation_id
         AND v.contact_id=m.contact_id AND v.whatsapp_account_id=m.whatsapp_account_id
       JOIN app.whatsapp_accounts a ON a.tenant_id=m.tenant_id AND a.id=m.whatsapp_account_id
       LEFT JOIN app.provider_credentials pc ON pc.tenant_id=m.tenant_id AND pc.whatsapp_account_id=a.id
       LEFT JOIN LATERAL (
         SELECT status, plan_id, count(*) OVER () AS eligible_count
         FROM app.subscriptions WHERE tenant_id=m.tenant_id
           AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
         ORDER BY starts_at DESC LIMIT 1
       ) s ON s.eligible_count=1
       LEFT JOIN app.plans p ON p.id=s.plan_id
       LEFT JOIN app.templates tp ON tp.tenant_id=m.tenant_id AND tp.whatsapp_account_id=a.id
         AND tp.id::text=m.content->>'templateId' AND tp.is_deleted=FALSE
       LEFT JOIN app.campaigns cg ON cg.tenant_id=m.tenant_id AND cg.id=m.campaign_id AND cg.is_deleted=false
       WHERE m.id=$1 AND m.direction='OUTBOUND'
       FOR UPDATE OF m`,
      [messageId],
    );
    return result.rows[0];
  }

  async markSending(
    session: PoolClient,
    message: DeliverySnapshot,
    attempt: number,
  ): Promise<void> {
    await session.query(
      `UPDATE app.messages SET status='SENDING', error_code=NULL, error_message=NULL,
         policy_decision=jsonb_set(policy_decision, '{delivery}', $3::jsonb), updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status IN ('CREATED','QUEUED')`,
      [message.tenant_id, message.id, JSON.stringify({ attempt, state: "SENDING" })],
    );
    await this.audit(session, message, "OUTBOUND_MESSAGE_ATTEMPT", { attempt });
  }

  async markAccepted(
    session: PoolClient,
    message: DeliverySnapshot,
    providerId: string,
    acceptedAt: string,
  ): Promise<void> {
    await session.query(
      `UPDATE app.messages SET status=CASE WHEN status IN ('DELIVERED','READ') THEN status ELSE 'SENT' END,
         provider_message_id=$3, sent_at=COALESCE(sent_at,$4), error_code=NULL, error_message=NULL, updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status IN ('SENDING','SENT','DELIVERED','READ')`,
      [message.tenant_id, message.id, providerId, acceptedAt],
    );
    await this.audit(session, message, "OUTBOUND_MESSAGE_ACCEPTED", {});
    await session.query(
      `UPDATE app.campaign_recipients SET status=CASE WHEN status IN ('DELIVERED','READ') THEN status ELSE 'SENT' END,updated_at=now() WHERE tenant_id=$1 AND message_id=$2`,
      [message.tenant_id, message.id],
    );
  }

  async markFailure(
    session: PoolClient,
    message: DeliverySnapshot,
    failure: DeliveryFailure,
  ): Promise<void> {
    await session.query(
      `UPDATE app.messages SET status=$3, error_code=$4, error_message='Outbound delivery could not complete.',
         policy_decision=jsonb_set(policy_decision, '{delivery}', COALESCE(policy_decision->'delivery','{}'::jsonb) || $5::jsonb),
         updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status IN ('CREATED','QUEUED','SENDING') AND provider_message_id IS NULL`,
      [
        message.tenant_id,
        message.id,
        failure.retryable && !failure.exhausted ? "QUEUED" : "FAILED",
        failure.exhausted ? "MESSAGE_DELIVERY_RETRIES_EXHAUSTED" : failure.code,
        JSON.stringify({
          last_code: failure.code,
          replayable: failure.retryable,
          exhausted: failure.exhausted,
        }),
      ],
    );
    await this.audit(session, message, "OUTBOUND_MESSAGE_FAILURE", {
      code: failure.code,
      exhausted: failure.exhausted,
    });
    await session.query(
      `UPDATE app.campaign_recipients SET status=$3,skip_or_error_code=$4,updated_at=now() WHERE tenant_id=$1 AND message_id=$2 AND status NOT IN ('DELIVERED','READ')`,
      [
        message.tenant_id,
        message.id,
        failure.retryable && !failure.exhausted ? "QUEUED" : "FAILED",
        failure.code,
      ],
    );
  }

  async replay(
    session: PoolClient,
    tenantId: string,
    messageId: string,
    eventId: string,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE app.messages SET status='CREATED', error_code=NULL, error_message=NULL,
         policy_decision=policy_decision - 'delivery', updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND direction='OUTBOUND' AND status='FAILED'
         AND provider_message_id IS NULL
         AND policy_decision->'delivery'->>'replayable'='true'
         AND error_code IN ('MESSAGE_DELIVERY_RETRIES_EXHAUSTED','WHATSAPP_PROVIDER_RATE_LIMITED','WHATSAPP_PROVIDER_TRANSIENT')
       RETURNING id`,
      [tenantId, messageId],
    );
    if (result.rowCount !== 1) return false;
    await session.query(
      `INSERT INTO app.outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id)
       VALUES ($1::uuid,$2,'message',$3,'message.outbound.created',$4::jsonb,$1::text)`,
      [eventId, tenantId, messageId, JSON.stringify({ message_id: messageId })],
    );
    await session.query(
      `INSERT INTO app.audit_logs (tenant_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
       VALUES ($1,'SYSTEM','OUTBOUND_MESSAGE_REPLAY','message',$2,'SUCCESS','{}'::jsonb,$3)`,
      [tenantId, messageId, eventId],
    );
    return true;
  }

  private async audit(
    session: PoolClient,
    message: DeliverySnapshot,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await session.query(
      `INSERT INTO app.audit_logs (tenant_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
       VALUES ($1,'SYSTEM',$2,'message',$3,$4,$5::jsonb,$3::text)`,
      [
        message.tenant_id,
        action,
        message.id,
        action === "OUTBOUND_MESSAGE_FAILURE" ? "FAILED" : "SUCCESS",
        JSON.stringify(metadata),
      ],
    );
  }
}
