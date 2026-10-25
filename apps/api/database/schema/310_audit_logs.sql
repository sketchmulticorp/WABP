-- Append-only security and material business action record.
CREATE TABLE app.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES app.tenants(id),
  actor_id uuid REFERENCES app.users(id),
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  result text NOT NULL CHECK (result IN ('SUCCESS', 'DENIED', 'FAILED')),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NOT NULL,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_tenant_created_idx
  ON app.audit_logs (tenant_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx
  ON app.audit_logs (tenant_id, entity_type, entity_id, created_at DESC);
