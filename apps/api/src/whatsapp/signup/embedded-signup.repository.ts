import { sql } from "drizzle-orm";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import type { VerifiedSignup } from "./meta-embedded-signup.adapter.js";

/** Locks the tenant before selecting a default account; never transfers another tenant's assets. */
export class EmbeddedSignupRepository {
  async connect(transaction: AppDatabaseTransaction, tenantId: string, verified: VerifiedSignup) {
    const tenant = await transaction.execute<{ id: string }>(sql`
      SELECT id FROM app.tenants WHERE id=${tenantId}::uuid AND is_deleted=FALSE AND status='ACTIVE' FOR UPDATE`);
    if (!tenant.rows[0]) return undefined;
    const result = await transaction.execute<{ id: string }>(sql`
      INSERT INTO app.whatsapp_accounts(tenant_id,provider,waba_id,phone_number_id,
        display_phone,display_name,status,is_default,health,last_synced_at)
      VALUES(${tenantId}::uuid,'META',${verified.wabaId},${verified.phoneNumberId},
        ${verified.displayPhone},${verified.displayName},'CONNECTED',
        NOT EXISTS(SELECT 1 FROM app.whatsapp_accounts WHERE tenant_id=${tenantId}::uuid AND is_default=TRUE),
        '{"source":"embedded_signup_verified","messaging_activation":"not_performed"}'::jsonb,now())
      ON CONFLICT(provider,phone_number_id) DO UPDATE SET waba_id=EXCLUDED.waba_id,
        display_phone=EXCLUDED.display_phone,display_name=EXCLUDED.display_name,
        status='CONNECTED',health=EXCLUDED.health,last_synced_at=now(),updated_at=now()
      WHERE app.whatsapp_accounts.tenant_id=EXCLUDED.tenant_id
        AND app.whatsapp_accounts.waba_id=EXCLUDED.waba_id
      RETURNING id`);
    return result.rows[0];
  }
}
