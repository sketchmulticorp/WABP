-- Nodes belonging to one immutable automation version.
CREATE TABLE app.automation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  version_id uuid NOT NULL,
  node_key text NOT NULL,
  node_type text NOT NULL CHECK (
    node_type IN (
      'START', 'MESSAGE', 'BUTTONS', 'LIST', 'ASSIGN',
      'CONTACT_UPDATE', 'HUMAN_HANDOFF', 'END'
    )
  ),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (version_id, node_key),
  UNIQUE (tenant_id, id),
  CONSTRAINT automation_nodes_tenant_version_fk
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES app.automation_versions(tenant_id, id)
);
