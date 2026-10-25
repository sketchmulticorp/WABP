-- WhatsApp templates with separate tenant-Admin and provider approval state.
CREATE TABLE app.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  whatsapp_account_id uuid NOT NULL,
  provider_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text NOT NULL,
  provider_status text NOT NULL CHECK (
    provider_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')
  ),
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  provider_updated_at timestamptz,
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version > 0),
  approval_status text NOT NULL DEFAULT 'DRAFT' CHECK (
    approval_status IN ('NOT_REQUIRED', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED')
  ),
  approval_requested_by uuid REFERENCES app.users(id),
  approval_requested_at timestamptz,
  reviewed_by uuid REFERENCES app.users(id),
  reviewed_at timestamptz,
  approved_version integer CHECK (approved_version > 0),
  approval_rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (tenant_id, id),
  CONSTRAINT templates_tenant_account_fk
    FOREIGN KEY (tenant_id, whatsapp_account_id)
    REFERENCES app.whatsapp_accounts(tenant_id, id),
  CONSTRAINT templates_approval_state_ck CHECK (
    (
      approval_status IN ('NOT_REQUIRED', 'DRAFT')
      AND approval_requested_by IS NULL
      AND approval_requested_at IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND approved_version IS NULL
      AND approval_rejection_reason IS NULL
    )
    OR (
      approval_status = 'PENDING'
      AND approval_requested_by IS NOT NULL
      AND approval_requested_at IS NOT NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND approved_version IS NULL
      AND approval_rejection_reason IS NULL
    )
    OR (
      approval_status = 'APPROVED'
      AND approval_requested_by IS NOT NULL
      AND approval_requested_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND reviewed_by <> approval_requested_by
      AND approved_version = content_version
      AND approval_rejection_reason IS NULL
    )
    OR (
      approval_status = 'REJECTED'
      AND approval_requested_by IS NOT NULL
      AND approval_requested_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND reviewed_by <> approval_requested_by
      AND approved_version IS NULL
      AND NULLIF(BTRIM(approval_rejection_reason), '') IS NOT NULL
    )
  ),
  CONSTRAINT templates_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX templates_identity_active_uq
  ON app.templates (tenant_id, whatsapp_account_id, name, language)
  WHERE is_deleted = false;
CREATE INDEX templates_tenant_status_active_idx
  ON app.templates (tenant_id, provider_status)
  WHERE is_deleted = false;
CREATE INDEX templates_tenant_approval_active_idx
  ON app.templates (tenant_id, approval_status, updated_at)
  WHERE is_deleted = false;
