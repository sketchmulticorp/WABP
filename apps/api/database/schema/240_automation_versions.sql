-- Immutable version snapshots pinned by active automation runs.
CREATE TABLE app.automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  flow_id uuid NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version_no),
  UNIQUE (tenant_id, id),
  CONSTRAINT automation_versions_tenant_flow_fk
    FOREIGN KEY (tenant_id, flow_id)
    REFERENCES app.automation_flows(tenant_id, id)
);
