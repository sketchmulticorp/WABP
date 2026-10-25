-- User-managed automation container; published versions remain immutable history.
CREATE TABLE app.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED')),
  published_version_id uuid,
  created_by uuid NOT NULL REFERENCES app.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (tenant_id, id),
  CONSTRAINT automation_flows_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX automation_flows_tenant_name_active_uq
  ON app.automation_flows (tenant_id, name)
  WHERE is_deleted = false;
