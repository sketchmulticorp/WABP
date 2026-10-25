-- Central updated_at maintenance for mutable tables.
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON app.plans
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON app.tenants
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON app.subscriptions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER roles_set_updated_at
BEFORE UPDATE ON app.roles
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON app.users
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER user_tenant_scopes_set_updated_at
BEFORE UPDATE ON app.user_tenant_scopes
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER whatsapp_accounts_set_updated_at
BEFORE UPDATE ON app.whatsapp_accounts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER provider_credentials_set_updated_at
BEFORE UPDATE ON app.provider_credentials
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER contacts_set_updated_at
BEFORE UPDATE ON app.contacts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER contact_groups_set_updated_at
BEFORE UPDATE ON app.contact_groups
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER contact_group_members_set_updated_at
BEFORE UPDATE ON app.contact_group_members
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER templates_set_updated_at
BEFORE UPDATE ON app.templates
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER campaigns_set_updated_at
BEFORE UPDATE ON app.campaigns
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON app.conversations
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER messages_set_updated_at
BEFORE UPDATE ON app.messages
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER campaign_recipients_set_updated_at
BEFORE UPDATE ON app.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER automation_flows_set_updated_at
BEFORE UPDATE ON app.automation_flows
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER automation_runs_set_updated_at
BEFORE UPDATE ON app.automation_runs
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER media_assets_set_updated_at
BEFORE UPDATE ON app.media_assets
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER idempotency_keys_set_updated_at
BEFORE UPDATE ON app.idempotency_keys
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
