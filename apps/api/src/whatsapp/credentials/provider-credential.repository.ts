import type { Pool } from "pg";
import { sql } from "drizzle-orm";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import type {
  EncryptedCredentialRepository,
  EncryptedCredentialRecord,
} from "@whatsapp-platform/whatsapp-provider";

/** Shared server-only persistence; API and Worker reuse their existing connection pools. */
export class ProviderCredentialRepository implements EncryptedCredentialRepository {
  constructor(private readonly pool: Pool) {}

  async lockAccount(transaction: AppDatabaseTransaction, tenantId: string, accountId: string) {
    const result = await transaction.execute<{
      accountId: string;
      credentialId: string | null;
    }>(sql`
      SELECT wa.id AS "accountId",(SELECT pc.id FROM app.provider_credentials pc
        WHERE pc.tenant_id=wa.tenant_id AND pc.whatsapp_account_id=wa.id) AS "credentialId"
      FROM app.whatsapp_accounts wa JOIN app.tenants t ON t.id=wa.tenant_id
      WHERE wa.id=${accountId}::uuid AND wa.tenant_id=${tenantId}::uuid
        AND wa.provider='META' AND t.is_deleted=FALSE AND t.status='ACTIVE' FOR UPDATE OF wa`);
    return result.rows[0];
  }

  async saveEncrypted(transaction: AppDatabaseTransaction, input: EncryptedCredentialRecord) {
    const result = await transaction.execute<{ id: string }>(sql`
      INSERT INTO app.provider_credentials(id,tenant_id,whatsapp_account_id,provider,
        secret_ref,encrypted_token,status,last_validated_at)
      VALUES(${input.id}::uuid,${input.tenantId}::uuid,${input.accountId}::uuid,'META',
        ${`encrypted://${input.id}`},${input.encryptedToken},'ACTIVE',now())
      ON CONFLICT(whatsapp_account_id) DO UPDATE SET secret_ref=EXCLUDED.secret_ref,
        encrypted_token=EXCLUDED.encrypted_token,status='ACTIVE',last_validated_at=now(),updated_at=now()
      WHERE app.provider_credentials.id=EXCLUDED.id AND app.provider_credentials.tenant_id=EXCLUDED.tenant_id
      RETURNING id`);
    return result.rows[0];
  }

  recordReplacementAudit(
    transaction: AppDatabaseTransaction,
    input: {
      tenantId: string;
      actorId: string;
      accountId: string;
      requestId: string;
    },
  ) {
    return transaction.execute(sql`INSERT INTO app.audit_logs(tenant_id,actor_id,
      actor_role,action,entity_type,entity_id,result,metadata,request_id)
      VALUES(${input.tenantId}::uuid,${input.actorId}::uuid,'TENANT_ADMIN',
      'WHATSAPP_CREDENTIAL_REPLACED','whatsapp_account',${input.accountId},'SUCCESS','{}'::jsonb,${input.requestId})`);
  }

  async findActive(
    reference: string,
    accountId: string,
  ): Promise<EncryptedCredentialRecord | undefined> {
    const result = await this.pool.query<EncryptedCredentialRecord>(
      `SELECT pc.id,pc.tenant_id AS "tenantId",pc.whatsapp_account_id AS "accountId",
       pc.encrypted_token AS "encryptedToken"
       FROM app.provider_credentials pc
       JOIN app.whatsapp_accounts wa ON wa.id=pc.whatsapp_account_id AND wa.tenant_id=pc.tenant_id
       JOIN app.tenants t ON t.id=pc.tenant_id AND t.is_deleted=FALSE AND t.status='ACTIVE'
       WHERE pc.secret_ref=$1 AND pc.whatsapp_account_id=$2 AND pc.provider='META'
         AND pc.status='ACTIVE' AND pc.encrypted_token IS NOT NULL
         AND wa.provider='META' AND wa.status<>'DISCONNECTED' LIMIT 1`,
      [reference, accountId],
    );
    return result.rows[0];
  }
}
