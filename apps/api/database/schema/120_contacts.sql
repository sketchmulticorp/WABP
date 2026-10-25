-- Canonical tenant contact identified by normalized E.164 phone number.
CREATE TABLE app.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  phone_e164 text NOT NULL,
  name text,
  email text,
  company text,
  address text,
  source text,
  assigned_user_id uuid REFERENCES app.users(id),
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (
    consent_status IN ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT', 'SUPPRESSED')
  ),
  consent_source text,
  consent_at timestamptz,
  consent_category text,
  consent_proof_reference text,
  opt_out_at timestamptz,
  opt_out_source text,
  suppression_reason text,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (tenant_id, id),
  CONSTRAINT contacts_soft_delete_ck CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR (is_deleted = true AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT contacts_opted_in_evidence_ck CHECK (
    consent_status <> 'OPTED_IN'
    OR (
      consent_source IS NOT NULL
      AND consent_at IS NOT NULL
      AND consent_proof_reference IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX contacts_tenant_phone_active_uq
  ON app.contacts (tenant_id, phone_e164)
  WHERE is_deleted = false;
CREATE INDEX contacts_tenant_name_active_idx
  ON app.contacts (tenant_id, name)
  WHERE is_deleted = false;
CREATE INDEX contacts_tenant_consent_active_idx
  ON app.contacts (tenant_id, consent_status)
  WHERE is_deleted = false;
CREATE INDEX contacts_tenant_created_active_idx
  ON app.contacts (tenant_id, created_at DESC, id DESC)
  WHERE is_deleted = false;
