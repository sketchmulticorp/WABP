-- Relationships that depend on tables created later or form intentional cycles.
ALTER TABLE app.tenants
  ADD CONSTRAINT tenants_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.roles
  ADD CONSTRAINT roles_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.users
  ADD CONSTRAINT users_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.user_tenant_scopes
  ADD CONSTRAINT user_tenant_scopes_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.contacts
  ADD CONSTRAINT contacts_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.contact_groups
  ADD CONSTRAINT contact_groups_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.contact_group_members
  ADD CONSTRAINT contact_group_members_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.templates
  ADD CONSTRAINT templates_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.campaigns
  ADD CONSTRAINT campaigns_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.automation_flows
  ADD CONSTRAINT automation_flows_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.media_assets
  ADD CONSTRAINT media_assets_deleted_by_fk
  FOREIGN KEY (deleted_by) REFERENCES app.users(id);

ALTER TABLE app.automation_flows
  ADD CONSTRAINT automation_flows_published_version_fk
  FOREIGN KEY (tenant_id, published_version_id)
  REFERENCES app.automation_versions(tenant_id, id);
-- Final preflight belongs to the same tenant; added with TASK-055.
ALTER TABLE app.campaigns ADD CONSTRAINT campaigns_tenant_final_preflight_fk
  FOREIGN KEY (tenant_id, final_preflight_id) REFERENCES app.campaign_preflight_runs(tenant_id, id);
