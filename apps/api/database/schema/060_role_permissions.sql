-- Many-to-many permission assignment for roles.
CREATE TABLE app.role_permissions (
  role_id uuid NOT NULL REFERENCES app.roles(id),
  permission_id uuid NOT NULL REFERENCES app.permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
