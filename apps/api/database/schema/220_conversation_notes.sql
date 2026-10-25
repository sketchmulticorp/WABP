-- Internal support notes retained as conversation history and never sent to Meta.
CREATE TABLE app.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  conversation_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES app.users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT conversation_notes_tenant_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES app.conversations(tenant_id, id)
);

CREATE INDEX conversation_notes_thread_idx
  ON app.conversation_notes (tenant_id, conversation_id, created_at);
