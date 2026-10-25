-- Append-only manual payment records. Future payment gateways normalize into this ledger.
CREATE TABLE app.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  recorded_by uuid NOT NULL REFERENCES app.users(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz NOT NULL,
  reference text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);
CREATE INDEX payment_records_tenant_paid_idx ON app.payment_records (tenant_id, paid_at DESC);
