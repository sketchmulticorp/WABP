-- Official Meta WhatsApp account/phone connections retained for message history.
CREATE TABLE app.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  provider text NOT NULL DEFAULT 'META',
  business_id text,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone text NOT NULL,
  display_name text,
  status text NOT NULL CHECK (
    status IN ('PENDING', 'CONNECTED', 'DEGRADED', 'AUTH_FAILED', 'DISCONNECTED')
  ),
  is_default boolean NOT NULL DEFAULT false,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, phone_number_id),
  UNIQUE (tenant_id, id)
);

CREATE INDEX whatsapp_accounts_tenant_status_idx
  ON app.whatsapp_accounts (tenant_id, status);
CREATE UNIQUE INDEX whatsapp_accounts_one_default_uq
  ON app.whatsapp_accounts (tenant_id)
  WHERE is_default = true;
