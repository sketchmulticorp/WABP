-- Directed transitions between nodes in one automation version.
CREATE TABLE app.automation_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  version_id uuid NOT NULL,
  from_node_id uuid NOT NULL,
  to_node_id uuid NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  UNIQUE (version_id, from_node_id, to_node_id, priority),
  CONSTRAINT automation_edges_tenant_version_fk
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES app.automation_versions(tenant_id, id),
  CONSTRAINT automation_edges_tenant_from_node_fk
    FOREIGN KEY (tenant_id, from_node_id)
    REFERENCES app.automation_nodes(tenant_id, id),
  CONSTRAINT automation_edges_tenant_to_node_fk
    FOREIGN KEY (tenant_id, to_node_id)
    REFERENCES app.automation_nodes(tenant_id, id)
);
