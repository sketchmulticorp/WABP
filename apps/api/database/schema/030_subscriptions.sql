-- Tenant plan periods. Lifecycle status preserves commercial history.
CREATE TABLE app.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  plan_id uuid NOT NULL REFERENCES app.plans(id),
  status text NOT NULL CHECK (
    status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')
  ),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  external_customer_ref text,
  external_subscription_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_period_ck CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX subscriptions_tenant_status_idx
  ON app.subscriptions (tenant_id, status);
