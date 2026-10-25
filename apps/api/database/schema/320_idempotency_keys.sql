-- Request deduplication records with bounded retention through expires_at.
CREATE TABLE app.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES app.tenants(id),
  actor_id uuid REFERENCES app.users(id),
  http_method text NOT NULL,
  route_key text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body jsonb,
  state text NOT NULL CHECK (state IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, actor_id, http_method, route_key, idempotency_key)
);

CREATE INDEX idempotency_keys_expiry_idx
  ON app.idempotency_keys (expires_at);
