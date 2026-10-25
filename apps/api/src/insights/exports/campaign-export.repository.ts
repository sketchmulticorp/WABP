import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { APP_DATABASE } from "../../database/database.constants.js";
import type { AppDatabase } from "../../database/database.types.js";
import type { TenantRepositoryContext } from "../../authorization/authorization.types.js";
import { EXPORT_MAX_ROWS } from "./report-csv.js";

export interface RecipientExportRow {
  readonly [key: string]: unknown;
  readonly contactId: string;
  readonly phone: string;
  readonly status: string;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sentAt: string | null;
  readonly deliveredAt: string | null;
  readonly readAt: string | null;
}
/** Tenant-only allowlist: no snapshot variables, message content or provider payloads. */
@Injectable()
export class CampaignExportRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async recipients(
    context: TenantRepositoryContext,
    campaignId: string,
  ): Promise<readonly RecipientExportRow[]> {
    return (
      await this.database.execute<RecipientExportRow>(sql`
      SELECT r.contact_id AS "contactId",c.phone_e164 AS phone,coalesce(m.status,r.status) AS status,
        coalesce(m.error_code,r.skip_or_error_code) AS "errorCode",r.created_at::text AS "createdAt",
        r.updated_at::text AS "updatedAt",m.sent_at::text AS "sentAt",m.delivered_at::text AS "deliveredAt",m.read_at::text AS "readAt"
      FROM app.campaign_recipients r
      JOIN app.campaigns cp ON cp.id=r.campaign_id AND cp.tenant_id=r.tenant_id AND cp.is_deleted=false
      JOIN app.tenants t ON t.id=r.tenant_id AND t.is_deleted=false
      JOIN app.contacts c ON c.id=r.contact_id AND c.tenant_id=r.tenant_id AND c.is_deleted=false
      LEFT JOIN app.messages m ON m.id=r.message_id AND m.tenant_id=r.tenant_id AND m.campaign_id=r.campaign_id AND m.contact_id=r.contact_id
      WHERE r.tenant_id=${context.tenantId}::uuid AND r.campaign_id=${campaignId}::uuid
      ORDER BY r.id LIMIT ${EXPORT_MAX_ROWS + 1}`)
    ).rows;
  }
}
