import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  campaignsInApp as campaigns,
  templatesInApp as templates,
  campaignRecipientsInApp as recipients,
  messagesInApp as messages,
  campaignPreflightRunsInApp as runs,
} from "../database/schema/index.js";

export interface LifecyclePatch {
  readonly status?: string;
  readonly approvalStatus?: string;
  readonly approvalRequestedBy?: string | null;
  readonly approvalRequestedAt?: string | null;
  readonly reviewedBy?: string | null;
  readonly reviewedAt?: string | null;
  readonly approvedVersion?: number | null;
  readonly approvalRejectionReason?: string | null;
  readonly templateContentVersion?: number | null;
  readonly startKey?: string;
  readonly startHash?: string;
  readonly deliveryRequestedBy?: string;
  readonly pauseReason?: string | null;
  readonly finalPreflightId?: string | null;
  readonly completedAt?: string;
}

@Injectable()
export class CampaignLifecycleRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
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
  async template(tx: AppDatabaseTransaction, tenantId: string, id: string, accountId: string) {
    const rows = await tx
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.tenantId, tenantId),
          eq(templates.id, id),
          eq(templates.whatsappAccountId, accountId),
          eq(templates.isDeleted, false),
        ),
      )
      .for("share");
    return rows[0];
  }
  async update(tx: AppDatabaseTransaction, tenantId: string, id: string, patch: LifecyclePatch) {
    await tx
      .update(campaigns)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(
        and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id), eq(campaigns.isDeleted, false)),
      );
  }
  async cancelUnsent(tx: AppDatabaseTransaction, tenantId: string, id: string) {
    await tx
      .update(messages)
      .set({
        status: "CANCELLED",
        errorCode: "CAMPAIGN_CANCELLED",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.campaignId, id),
          sql`${messages.status} in ('CREATED','QUEUED')`,
          sql`${messages.providerMessageId} is null`,
        ),
      );
    await tx.execute(
      sql`update app.campaign_recipients r set status='CANCELLED',skip_or_error_code='CAMPAIGN_CANCELLED',updated_at=now() from app.messages m where r.tenant_id=${tenantId} and r.campaign_id=${id} and m.tenant_id=r.tenant_id and m.id=r.message_id and m.status='CANCELLED'`,
    );
    await tx
      .update(recipients)
      .set({
        status: "CANCELLED",
        skipOrErrorCode: "CAMPAIGN_CANCELLED",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(recipients.tenantId, tenantId),
          eq(recipients.campaignId, id),
          eq(recipients.status, "PENDING"),
        ),
      );
  }
  async report(tenantId: string, id: string, cursor?: string) {
    const [finalPreflight] = await this.database
      .select({ status: runs.status, blockers: runs.blockers, errorCode: runs.errorCode })
      .from(campaigns)
      .innerJoin(
        runs,
        and(eq(runs.tenantId, campaigns.tenantId), eq(runs.id, campaigns.finalPreflightId)),
      )
      .where(
        and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id), eq(campaigns.isDeleted, false)),
      )
      .limit(1);
    const counts = await this.database.execute<{ status: string; count: number }>(sql`
      select coalesce(m.status,r.status) as status,count(*)::int as count
      from app.campaign_recipients r left join app.messages m on m.tenant_id=r.tenant_id and m.id=r.message_id
      where r.tenant_id=${tenantId} and r.campaign_id=${id} group by coalesce(m.status,r.status)`);
    const rows = await this.database
      .select({
        id: recipients.id,
        contactId: recipients.contactId,
        status: sql<string>`coalesce(${messages.status},${recipients.status})`,
        reason: sql<string | null>`coalesce(${messages.errorCode},${recipients.skipOrErrorCode})`,
        messageId: recipients.messageId,
      })
      .from(recipients)
      .leftJoin(
        messages,
        and(eq(messages.tenantId, recipients.tenantId), eq(messages.id, recipients.messageId)),
      )
      .where(
        and(
          eq(recipients.tenantId, tenantId),
          eq(recipients.campaignId, id),
          cursor === undefined ? undefined : gt(recipients.id, cursor),
        ),
      )
      .orderBy(recipients.id)
      .limit(51);
    return {
      finalPreflight: finalPreflight ?? null,
      counts: counts.rows,
      recipients: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
      asOf: new Date().toISOString(),
    };
  }
}
