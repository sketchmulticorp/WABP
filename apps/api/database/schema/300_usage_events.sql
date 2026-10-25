-- Append-only usage ledger used for limits, reporting, and reconciliation.
CREATE TABLE app.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  event_type text NOT NULL,
  quantity numeric(20, 6) NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  dedupe_key text NOT NULL,
  related_entity_type text,
  related_entity_id uuid,
  provider_reference text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX usage_events_period_idx
  ON app.usage_events (tenant_id, occurred_at, event_type);
