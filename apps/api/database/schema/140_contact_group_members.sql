-- Recoverable membership between one active contact and one active group.
CREATE TABLE app.contact_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  group_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT contact_group_members_tenant_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES app.contact_groups(tenant_id, id),
  CONSTRAINT contact_group_members_tenant_contact_fk
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES app.contacts(tenant_id, id),
  CONSTRAINT contact_group_members_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX contact_group_members_active_uq
  ON app.contact_group_members (group_id, contact_id)
  WHERE is_deleted = false;
CREATE INDEX contact_group_members_contact_active_idx
  ON app.contact_group_members (tenant_id, contact_id)
  WHERE is_deleted = false;
