-- One durable inbox conversation per tenant/account/contact combination.
CREATE TABLE app.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  whatsapp_account_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  assigned_user_id uuid REFERENCES app.users(id),
  status text NOT NULL CHECK (status IN ('OPEN', 'PENDING', 'CLOSED', 'ARCHIVED')),
  automation_state text NOT NULL DEFAULT 'NONE' CHECK (
    automation_state IN ('NONE', 'ACTIVE', 'PAUSED', 'HANDED_OFF')
  ),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_customer_message_at timestamptz,
  window_expires_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, whatsapp_account_id, contact_id),
  UNIQUE (tenant_id, id),
  CONSTRAINT conversations_tenant_account_fk
    FOREIGN KEY (tenant_id, whatsapp_account_id)
    REFERENCES app.whatsapp_accounts(tenant_id, id),
  CONSTRAINT conversations_tenant_contact_fk
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES app.contacts(tenant_id, id)
);

CREATE INDEX conversations_inbox_idx
  ON app.conversations (tenant_id, status, last_message_at DESC);
CREATE INDEX conversations_assignee_idx
  ON app.conversations (tenant_id, assigned_user_id, status);
