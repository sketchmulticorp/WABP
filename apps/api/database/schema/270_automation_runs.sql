-- Runtime state pinned to the automation version that started the run.
CREATE TABLE app.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  flow_version_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  current_node_id uuid,
  status text NOT NULL CHECK (
    status IN ('RUNNING', 'WAITING', 'PAUSED', 'HANDED_OFF', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_key text,
  lock_version integer NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  CONSTRAINT automation_runs_tenant_version_fk
    FOREIGN KEY (tenant_id, flow_version_id)
    REFERENCES app.automation_versions(tenant_id, id),
  CONSTRAINT automation_runs_tenant_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES app.conversations(tenant_id, id),
  CONSTRAINT automation_runs_tenant_node_fk
    FOREIGN KEY (tenant_id, current_node_id)
    REFERENCES app.automation_nodes(tenant_id, id)
);

CREATE UNIQUE INDEX automation_runs_one_active_uq
  ON app.automation_runs (tenant_id, conversation_id)
  WHERE status IN ('RUNNING', 'WAITING', 'PAUSED', 'HANDED_OFF');
