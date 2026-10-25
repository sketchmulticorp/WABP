-- Row-level import failures retained for a downloadable correction report.
CREATE TABLE app.contact_import_errors (
  id bigserial PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES app.contact_imports(id),
  row_number integer NOT NULL CHECK (row_number > 0),
  error_code text NOT NULL,
  error_message text NOT NULL,
  row_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, row_number, error_code)
);

CREATE INDEX contact_import_errors_import_row_idx
  ON app.contact_import_errors (import_id, row_number);
