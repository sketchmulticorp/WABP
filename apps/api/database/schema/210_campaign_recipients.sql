-- Frozen campaign audience rows and recipient-level delivery outcomes.
CREATE TABLE app.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  campaign_id uuid NOT NULL,
  preflight_run_id uuid,
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version > 0),
  contact_id uuid NOT NULL,
  message_id uuid,
  status text NOT NULL CHECK (
    status IN ('PENDING', 'SKIPPED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED')
  ),
  rendered_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  skip_or_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id),
  UNIQUE (tenant_id, id),
  CONSTRAINT campaign_recipients_tenant_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES app.campaigns(tenant_id, id),
  CONSTRAINT campaign_recipients_tenant_contact_fk
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES app.contacts(tenant_id, id),
  CONSTRAINT campaign_recipients_tenant_preflight_run_fk
    FOREIGN KEY (tenant_id, preflight_run_id)
    REFERENCES app.campaign_preflight_runs(tenant_id, id),
  CONSTRAINT campaign_recipients_tenant_message_fk
    FOREIGN KEY (tenant_id, message_id)
    REFERENCES app.messages(tenant_id, id)
);

CREATE INDEX campaign_recipients_report_idx
  ON app.campaign_recipients (tenant_id, campaign_id, status);
