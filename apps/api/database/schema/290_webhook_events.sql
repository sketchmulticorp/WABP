-- Durable, deduplicated provider events retained for replay and diagnosis.
CREATE TABLE app.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_key text NOT NULL,
  event_type text NOT NULL,
  whatsapp_account_id uuid REFERENCES app.whatsapp_accounts(id),
  tenant_id uuid REFERENCES app.tenants(id),
  payload jsonb,
  payload_ref text,
  status text NOT NULL CHECK (
    status IN ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  provider_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_event_key)
);

CREATE INDEX webhook_events_pending_idx
  ON app.webhook_events (status, received_at)
  WHERE status IN ('RECEIVED', 'QUEUED', 'FAILED');
