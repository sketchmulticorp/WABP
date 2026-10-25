-- Asynchronous contact import jobs and their aggregate processing counts.
CREATE TABLE app.contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  requested_by uuid NOT NULL REFERENCES app.users(id),
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_country_code char(2),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  inserted_rows integer NOT NULL DEFAULT 0 CHECK (inserted_rows >= 0),
  updated_rows integer NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX contact_imports_tenant_created_idx
  ON app.contact_imports (tenant_id, created_at DESC);
