-- Immutable message history with mutable delivery state and provider identifiers.
CREATE TABLE app.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  conversation_id uuid NOT NULL,
  campaign_id uuid,
  contact_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  message_type text NOT NULL CHECK (
    message_type IN (
      'TEXT', 'TEMPLATE', 'IMAGE', 'VIDEO', 'DOCUMENT',
      'AUDIO', 'INTERACTIVE', 'SYSTEM'
    )
  ),
  status text NOT NULL CHECK (
    status IN (
      'RECEIVED', 'CREATED', 'QUEUED', 'SENDING', 'SENT',
      'DELIVERED', 'READ', 'FAILED', 'CANCELLED'
    )
  ),
  provider_message_id text UNIQUE,
  client_message_key text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  provider_created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT messages_tenant_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES app.conversations(tenant_id, id),
  CONSTRAINT messages_tenant_campaign_fk
    FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES app.campaigns(tenant_id, id),
  CONSTRAINT messages_tenant_contact_fk
    FOREIGN KEY (tenant_id, contact_id)
    REFERENCES app.contacts(tenant_id, id),
  CONSTRAINT messages_tenant_account_fk
    FOREIGN KEY (tenant_id, whatsapp_account_id)
    REFERENCES app.whatsapp_accounts(tenant_id, id)
);

CREATE UNIQUE INDEX messages_client_key_uq
  ON app.messages (tenant_id, client_message_key)
  WHERE client_message_key IS NOT NULL;
CREATE INDEX messages_conversation_created_idx
  ON app.messages (tenant_id, conversation_id, created_at DESC);
CREATE INDEX messages_campaign_status_idx
  ON app.messages (tenant_id, campaign_id, status)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX messages_pending_send_idx
  ON app.messages (status, created_at)
  WHERE status IN ('CREATED', 'QUEUED', 'SENDING');
