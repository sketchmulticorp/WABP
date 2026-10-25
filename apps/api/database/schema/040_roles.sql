-- Platform or tenant roles. tenant_id NULL identifies platform-level roles.
CREATE TABLE app.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES app.tenants(id),
  name text NOT NULL,
  system_key text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT roles_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX roles_tenant_name_active_uq
  ON app.roles (tenant_id, name)
  WHERE tenant_id IS NOT NULL AND is_deleted = false;
CREATE UNIQUE INDEX roles_platform_name_active_uq
  ON app.roles (name)
  WHERE tenant_id IS NULL AND is_deleted = false;
CREATE UNIQUE INDEX roles_tenant_system_key_active_uq
  ON app.roles (tenant_id, system_key)
  WHERE tenant_id IS NOT NULL AND system_key IS NOT NULL AND is_deleted = false;
CREATE UNIQUE INDEX roles_platform_system_key_active_uq
  ON app.roles (system_key)
  WHERE tenant_id IS NULL AND system_key IS NOT NULL AND is_deleted = false;
