-- Single-business tenant membership for Tenant Admins and Tenant Users.
CREATE TABLE app.user_tenant_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  role_id uuid REFERENCES app.roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT user_tenant_scopes_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX user_tenant_scopes_user_active_uq
  ON app.user_tenant_scopes (user_id)
  WHERE is_deleted = false;
CREATE INDEX user_tenant_scopes_tenant_active_idx
  ON app.user_tenant_scopes (tenant_id, user_id)
  WHERE is_deleted = false;
