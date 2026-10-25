-- Development references or authenticated ciphertext; plaintext tokens/keys are forbidden.
CREATE TABLE app.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  whatsapp_account_id uuid NOT NULL,
  provider text NOT NULL,
  secret_ref text NOT NULL,
  encrypted_token text,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INVALID', 'REVOKED')),
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_account_id),
  CONSTRAINT provider_credentials_storage_check CHECK (
    (encrypted_token IS NULL AND secret_ref NOT LIKE 'encrypted://%') OR
    (encrypted_token IS NOT NULL AND secret_ref = 'encrypted://' || id::text)
  ),
  CONSTRAINT provider_credentials_tenant_account_fk
    FOREIGN KEY (tenant_id, whatsapp_account_id)
    REFERENCES app.whatsapp_accounts(tenant_id, id)
);
