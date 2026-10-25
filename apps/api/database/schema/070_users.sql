-- Platform and tenant users. Authentication identity remains recoverable after deletion.
CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_tenant_id uuid REFERENCES app.tenants(id),
  role_id uuid NOT NULL REFERENCES app.roles(id),
  email text NOT NULL,
  password_hash text NOT NULL,
  -- Existing identities remain unchanged; provisioning explicitly marks temporary credentials.
  must_change_password boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED')),
  two_factor_enabled boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 1,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT users_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX users_email_active_uq
  ON app.users (lower(email))
  WHERE is_deleted = false;
CREATE INDEX users_home_tenant_active_idx
  ON app.users (home_tenant_id, status)
  WHERE is_deleted = false;
