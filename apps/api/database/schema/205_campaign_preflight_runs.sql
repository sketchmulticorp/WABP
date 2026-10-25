-- Durable, version-bound campaign preflight attempts and aggregate results.
CREATE TABLE app.campaign_preflight_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  campaign_id uuid NOT NULL,
  content_version integer NOT NULL CHECK (content_version > 0),
  status text NOT NULL CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SUPERSEDED')),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimates jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  requested_by uuid NOT NULL REFERENCES app.users(id),
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  CONSTRAINT campaign_preflight_runs_tenant_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES app.campaigns(tenant_id, id)
);

CREATE UNIQUE INDEX campaign_preflight_runs_one_active_idx
  ON app.campaign_preflight_runs (campaign_id)
  WHERE status IN ('QUEUED', 'PROCESSING');
CREATE INDEX campaign_preflight_runs_tenant_campaign_idx
  ON app.campaign_preflight_runs (tenant_id, campaign_id, created_at DESC);
