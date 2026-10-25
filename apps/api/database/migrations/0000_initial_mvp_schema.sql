CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"result" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_result_check" CHECK (result = ANY (ARRAY['SUCCESS'::text, 'DENIED'::text, 'FAILED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"token_family_id" uuid NOT NULL,
	"replaced_by_session_id" uuid,
	"user_agent" text,
	"ip_address" "inet",
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_refresh_token_hash_key" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."automation_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "automation_edges_version_id_from_node_id_to_node_id_priorit_key" UNIQUE("version_id","from_node_id","to_node_id","priority")
);
--> statement-breakpoint
CREATE TABLE "app"."automation_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"published_version_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "automation_flows_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "automation_flows_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))),
	CONSTRAINT "automation_flows_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'PAUSED'::text, 'RETIRED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."automation_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"node_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "automation_nodes_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "automation_nodes_version_id_node_key_key" UNIQUE("version_id","node_key"),
	CONSTRAINT "automation_nodes_node_type_check" CHECK (node_type = ANY (ARRAY['START'::text, 'MESSAGE'::text, 'BUTTONS'::text, 'LIST'::text, 'ASSIGN'::text, 'CONTACT_UPDATE'::text, 'HUMAN_HANDOFF'::text, 'END'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"current_node_id" uuid,
	"status" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_event_key" text,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "automation_runs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "automation_runs_lock_version_check" CHECK (lock_version >= 0),
	CONSTRAINT "automation_runs_status_check" CHECK (status = ANY (ARRAY['RUNNING'::text, 'WAITING'::text, 'PAUSED'::text, 'HANDED_OFF'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."automation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_versions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "automation_versions_flow_id_version_no_key" UNIQUE("flow_id","version_no"),
	CONSTRAINT "automation_versions_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'RETIRED'::text])),
	CONSTRAINT "automation_versions_version_no_check" CHECK (version_no > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"message_id" uuid,
	"status" text NOT NULL,
	"rendered_variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skip_or_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_recipients_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "campaign_recipients_campaign_id_contact_id_key" UNIQUE("campaign_id","contact_id"),
	CONSTRAINT "campaign_recipients_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'SKIPPED'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'READ'::text, 'FAILED'::text, 'CANCELLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"audience_definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variable_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"content_version" integer DEFAULT 1 NOT NULL,
	"approval_status" text DEFAULT 'DRAFT' NOT NULL,
	"approval_requested_by" uuid,
	"approval_requested_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_version" integer,
	"approval_rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "campaigns_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "campaigns_approval_state_ck" CHECK (((approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text])) AND (approval_requested_by IS NULL) AND (approval_requested_at IS NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'PENDING'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'APPROVED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version = content_version) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'REJECTED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version IS NULL) AND (NULLIF(btrim(approval_rejection_reason), ''::text) IS NOT NULL))),
	CONSTRAINT "campaigns_approval_status_check" CHECK (approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
	CONSTRAINT "campaigns_approved_version_check" CHECK (approved_version > 0),
	CONSTRAINT "campaigns_content_version_check" CHECK (content_version > 0),
	CONSTRAINT "campaigns_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))),
	CONSTRAINT "campaigns_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SCHEDULED'::text, 'QUEUED'::text, 'RUNNING'::text, 'PAUSED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'FAILED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."contact_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "contact_group_members_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."contact_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "contact_groups_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "contact_groups_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."contact_import_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"error_code" text NOT NULL,
	"error_message" text NOT NULL,
	"row_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_import_errors_row_number_check" CHECK (row_number > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."contact_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"status" text NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_country_code" char(2),
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_imports_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "contact_imports_inserted_rows_check" CHECK (inserted_rows >= 0),
	CONSTRAINT "contact_imports_invalid_rows_check" CHECK (invalid_rows >= 0),
	CONSTRAINT "contact_imports_status_check" CHECK (status = ANY (ARRAY['UPLOADED'::text, 'QUEUED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])),
	CONSTRAINT "contact_imports_total_rows_check" CHECK (total_rows >= 0),
	CONSTRAINT "contact_imports_updated_rows_check" CHECK (updated_rows >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"name" text,
	"email" text,
	"company" text,
	"address" text,
	"source" text,
	"assigned_user_id" uuid,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_status" text DEFAULT 'UNKNOWN' NOT NULL,
	"consent_source" text,
	"consent_at" timestamp with time zone,
	"consent_category" text,
	"opt_out_at" timestamp with time zone,
	"opt_out_source" text,
	"suppression_reason" text,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "contacts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "contacts_consent_status_check" CHECK (consent_status = ANY (ARRAY['UNKNOWN'::text, 'OPTED_IN'::text, 'OPTED_OUT'::text, 'SUPPRESSED'::text])),
	CONSTRAINT "contacts_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_notes_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"status" text NOT NULL,
	"automation_state" text DEFAULT 'NONE' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_customer_message_at" timestamp with time zone,
	"window_expires_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "conversations_tenant_id_whatsapp_account_id_contact_id_key" UNIQUE("tenant_id","whatsapp_account_id","contact_id"),
	CONSTRAINT "conversations_automation_state_check" CHECK (automation_state = ANY (ARRAY['NONE'::text, 'ACTIVE'::text, 'PAUSED'::text, 'HANDED_OFF'::text])),
	CONSTRAINT "conversations_status_check" CHECK (status = ANY (ARRAY['OPEN'::text, 'PENDING'::text, 'CLOSED'::text, 'ARCHIVED'::text])),
	CONSTRAINT "conversations_unread_count_check" CHECK (unread_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid,
	"http_method" text NOT NULL,
	"route_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_tenant_id_actor_id_http_method_route_key_i_key" UNIQUE NULLS NOT DISTINCT("tenant_id","actor_id","http_method","route_key","idempotency_key"),
	CONSTRAINT "idempotency_keys_response_status_check" CHECK ((response_status IS NULL) OR ((response_status >= 100) AND (response_status <= 599))),
	CONSTRAINT "idempotency_keys_state_check" CHECK (state = ANY (ARRAY['PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"scan_status" text NOT NULL,
	"provider_media_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "media_assets_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "media_assets_scan_status_check" CHECK (scan_status = ANY (ARRAY['PENDING'::text, 'CLEAN'::text, 'INFECTED'::text, 'FAILED'::text])),
	CONSTRAINT "media_assets_size_bytes_check" CHECK (size_bytes >= 0),
	CONSTRAINT "media_assets_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"message_type" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"client_message_key" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"provider_created_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "messages_provider_message_id_key" UNIQUE("provider_message_id"),
	CONSTRAINT "messages_direction_check" CHECK (direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text])),
	CONSTRAINT "messages_message_type_check" CHECK (message_type = ANY (ARRAY['TEXT'::text, 'TEMPLATE'::text, 'IMAGE'::text, 'VIDEO'::text, 'DOCUMENT'::text, 'AUDIO'::text, 'INTERACTIVE'::text, 'SYSTEM'::text])),
	CONSTRAINT "messages_status_check" CHECK (status = ANY (ARRAY['RECEIVED'::text, 'CREATED'::text, 'QUEUED'::text, 'SENDING'::text, 'SENT'::text, 'DELIVERED'::text, 'READ'::text, 'FAILED'::text, 'CANCELLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempt_count_check" CHECK (attempt_count >= 0),
	CONSTRAINT "outbox_events_schema_version_check" CHECK (schema_version > 0),
	CONSTRAINT "outbox_events_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PUBLISHED'::text, 'FAILED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permission_key" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_permission_key_key" UNIQUE("permission_key")
);
--> statement-breakpoint
CREATE TABLE "app"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3),
	"validity_days" integer,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_key" UNIQUE("code"),
	CONSTRAINT "plans_price_minor_check" CHECK (price_minor >= 0),
	CONSTRAINT "plans_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'RETIRED'::text])),
	CONSTRAINT "plans_validity_days_check" CHECK ((validity_days IS NULL) OR (validity_days > 0))
);
--> statement-breakpoint
CREATE TABLE "app"."provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"secret_ref" text NOT NULL,
	"status" text NOT NULL,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_whatsapp_account_id_key" UNIQUE("whatsapp_account_id"),
	CONSTRAINT "provider_credentials_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INVALID'::text, 'REVOKED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "app"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" text NOT NULL,
	"system_key" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "roles_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"external_customer_ref" text,
	"external_subscription_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_period_ck" CHECK ((ends_at IS NULL) OR (ends_at > starts_at)),
	CONSTRAINT "subscriptions_status_check" CHECK (status = ANY (ARRAY['TRIAL'::text, 'ACTIVE'::text, 'PAST_DUE'::text, 'SUSPENDED'::text, 'CANCELLED'::text, 'EXPIRED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"provider_template_id" text,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"provider_status" text NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"provider_updated_at" timestamp with time zone,
	"content_version" integer DEFAULT 1 NOT NULL,
	"approval_status" text DEFAULT 'DRAFT' NOT NULL,
	"approval_requested_by" uuid,
	"approval_requested_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_version" integer,
	"approval_rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "templates_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "templates_approval_state_ck" CHECK (((approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text])) AND (approval_requested_by IS NULL) AND (approval_requested_at IS NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'PENDING'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (approved_version IS NULL) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'APPROVED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version = content_version) AND (approval_rejection_reason IS NULL)) OR ((approval_status = 'REJECTED'::text) AND (approval_requested_by IS NOT NULL) AND (approval_requested_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> approval_requested_by) AND (approved_version IS NULL) AND (NULLIF(btrim(approval_rejection_reason), ''::text) IS NOT NULL))),
	CONSTRAINT "templates_approval_status_check" CHECK (approval_status = ANY (ARRAY['NOT_REQUIRED'::text, 'DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
	CONSTRAINT "templates_approved_version_check" CHECK (approved_version > 0),
	CONSTRAINT "templates_content_version_check" CHECK (content_version > 0),
	CONSTRAINT "templates_provider_status_check" CHECK (provider_status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'PAUSED'::text, 'DISABLED'::text])),
	CONSTRAINT "templates_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"default_timezone" text DEFAULT 'UTC' NOT NULL,
	"default_country_code" char(2),
	"business_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "tenants_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))),
	CONSTRAINT "tenants_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'CLOSED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"provider_reference" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_tenant_id_dedupe_key_key" UNIQUE("tenant_id","dedupe_key"),
	CONSTRAINT "usage_events_quantity_check" CHECK (quantity >= (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "app"."user_tenant_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "user_tenant_scopes_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_tenant_id" uuid,
	"role_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "users_soft_delete_ck" CHECK (((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL)) OR ((is_deleted = true) AND (deleted_at IS NOT NULL))),
	CONSTRAINT "users_status_check" CHECK (status = ANY (ARRAY['INVITED'::text, 'ACTIVE'::text, 'LOCKED'::text, 'DISABLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"whatsapp_account_id" uuid,
	"tenant_id" uuid,
	"payload" jsonb,
	"payload_ref" text,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"provider_created_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_provider_external_event_key_key" UNIQUE("provider","external_event_key"),
	CONSTRAINT "webhook_events_attempt_count_check" CHECK (attempt_count >= 0),
	CONSTRAINT "webhook_events_status_check" CHECK (status = ANY (ARRAY['RECEIVED'::text, 'QUEUED'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'FAILED'::text, 'DEAD'::text]))
);
--> statement-breakpoint
CREATE TABLE "app"."whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'META' NOT NULL,
	"business_id" text,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text NOT NULL,
	"display_name" text,
	"status" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_accounts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "whatsapp_accounts_provider_phone_number_id_key" UNIQUE("provider","phone_number_id"),
	CONSTRAINT "whatsapp_accounts_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'CONNECTED'::text, 'DEGRADED'::text, 'AUTH_FAILED'::text, 'DISCONNECTED'::text]))
);
--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "app"."auth_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_edges" ADD CONSTRAINT "automation_edges_tenant_from_node_fk" FOREIGN KEY ("tenant_id","from_node_id") REFERENCES "app"."automation_nodes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_edges" ADD CONSTRAINT "automation_edges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_edges" ADD CONSTRAINT "automation_edges_tenant_to_node_fk" FOREIGN KEY ("tenant_id","to_node_id") REFERENCES "app"."automation_nodes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_edges" ADD CONSTRAINT "automation_edges_tenant_version_fk" FOREIGN KEY ("tenant_id","version_id") REFERENCES "app"."automation_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_flows" ADD CONSTRAINT "automation_flows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_flows" ADD CONSTRAINT "automation_flows_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_flows" ADD CONSTRAINT "automation_flows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_nodes" ADD CONSTRAINT "automation_nodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_nodes" ADD CONSTRAINT "automation_nodes_tenant_version_fk" FOREIGN KEY ("tenant_id","version_id") REFERENCES "app"."automation_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_tenant_conversation_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "app"."conversations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_tenant_node_fk" FOREIGN KEY ("tenant_id","current_node_id") REFERENCES "app"."automation_nodes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_tenant_version_fk" FOREIGN KEY ("tenant_id","flow_version_id") REFERENCES "app"."automation_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_versions" ADD CONSTRAINT "automation_versions_tenant_flow_fk" FOREIGN KEY ("tenant_id","flow_id") REFERENCES "app"."automation_flows"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_versions" ADD CONSTRAINT "automation_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_campaign_fk" FOREIGN KEY ("tenant_id","campaign_id") REFERENCES "app"."campaigns"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "app"."contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_message_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "app"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_approval_requested_by_fkey" FOREIGN KEY ("approval_requested_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_tenant_account_fk" FOREIGN KEY ("tenant_id","whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_tenant_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "app"."templates"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_group_members" ADD CONSTRAINT "contact_group_members_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_group_members" ADD CONSTRAINT "contact_group_members_tenant_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "app"."contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_group_members" ADD CONSTRAINT "contact_group_members_tenant_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "app"."contact_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_group_members" ADD CONSTRAINT "contact_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_groups" ADD CONSTRAINT "contact_groups_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_groups" ADD CONSTRAINT "contact_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_import_errors" ADD CONSTRAINT "contact_import_errors_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "app"."contact_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_imports" ADD CONSTRAINT "contact_imports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_imports" ADD CONSTRAINT "contact_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversation_notes" ADD CONSTRAINT "conversation_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversation_notes" ADD CONSTRAINT "conversation_notes_tenant_conversation_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "app"."conversations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversation_notes" ADD CONSTRAINT "conversation_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_tenant_account_fk" FOREIGN KEY ("tenant_id","whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_tenant_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "app"."contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."media_assets" ADD CONSTRAINT "media_assets_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."media_assets" ADD CONSTRAINT "media_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_tenant_account_fk" FOREIGN KEY ("tenant_id","whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_tenant_campaign_fk" FOREIGN KEY ("tenant_id","campaign_id") REFERENCES "app"."campaigns"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_tenant_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "app"."contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_tenant_conversation_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "app"."conversations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provider_credentials" ADD CONSTRAINT "provider_credentials_tenant_account_fk" FOREIGN KEY ("tenant_id","whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provider_credentials" ADD CONSTRAINT "provider_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "app"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."templates" ADD CONSTRAINT "templates_approval_requested_by_fkey" FOREIGN KEY ("approval_requested_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."templates" ADD CONSTRAINT "templates_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."templates" ADD CONSTRAINT "templates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."templates" ADD CONSTRAINT "templates_tenant_account_fk" FOREIGN KEY ("tenant_id","whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."templates" ADD CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."usage_events" ADD CONSTRAINT "usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_tenant_scopes" ADD CONSTRAINT "user_tenant_scopes_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_tenant_scopes" ADD CONSTRAINT "user_tenant_scopes_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_tenant_scopes" ADD CONSTRAINT "user_tenant_scopes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_tenant_scopes" ADD CONSTRAINT "user_tenant_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_home_tenant_id_fkey" FOREIGN KEY ("home_tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."webhook_events" ADD CONSTRAINT "webhook_events_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "app"."whatsapp_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "app"."audit_logs" USING btree ("tenant_id","entity_type","entity_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "app"."audit_logs" USING btree ("tenant_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "auth_sessions_user_active_idx" ON "app"."auth_sessions" USING btree ("user_id","expires_at") WHERE (revoked_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "automation_flows_tenant_name_active_uq" ON "app"."automation_flows" USING btree ("tenant_id","name") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_one_active_uq" ON "app"."automation_runs" USING btree ("tenant_id","conversation_id") WHERE (status = ANY (ARRAY['RUNNING'::text, 'WAITING'::text, 'PAUSED'::text, 'HANDED_OFF'::text]));--> statement-breakpoint
CREATE INDEX "campaign_recipients_report_idx" ON "app"."campaign_recipients" USING btree ("tenant_id","campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_tenant_approval_active_idx" ON "app"."campaigns" USING btree ("tenant_id","approval_status","updated_at") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "campaigns_tenant_status_schedule_active_idx" ON "app"."campaigns" USING btree ("tenant_id","status","schedule_at") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "contact_group_members_active_uq" ON "app"."contact_group_members" USING btree ("group_id","contact_id") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "contact_group_members_contact_active_idx" ON "app"."contact_group_members" USING btree ("tenant_id","contact_id") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "contact_groups_tenant_name_active_uq" ON "app"."contact_groups" USING btree ("tenant_id","name") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "contact_import_errors_import_row_idx" ON "app"."contact_import_errors" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "contact_imports_tenant_created_idx" ON "app"."contact_imports" USING btree ("tenant_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "contacts_tenant_consent_active_idx" ON "app"."contacts" USING btree ("tenant_id","consent_status") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "contacts_tenant_name_active_idx" ON "app"."contacts" USING btree ("tenant_id","name") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_tenant_phone_active_uq" ON "app"."contacts" USING btree ("tenant_id","phone_e164") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "conversation_notes_thread_idx" ON "app"."conversation_notes" USING btree ("tenant_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_assignee_idx" ON "app"."conversations" USING btree ("tenant_id","assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "app"."conversations" USING btree ("tenant_id","status","last_message_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "app"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_active_uq" ON "app"."media_assets" USING btree ("tenant_id","storage_key") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "messages_campaign_status_idx" ON "app"."messages" USING btree ("tenant_id","campaign_id","status") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_key_uq" ON "app"."messages" USING btree ("tenant_id","client_message_key") WHERE (client_message_key IS NOT NULL);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "app"."messages" USING btree ("tenant_id","conversation_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "messages_pending_send_idx" ON "app"."messages" USING btree ("status","created_at") WHERE (status = ANY (ARRAY['CREATED'::text, 'QUEUED'::text, 'SENDING'::text]));--> statement-breakpoint
CREATE INDEX "outbox_events_relay_idx" ON "app"."outbox_events" USING btree ("status","available_at","created_at") WHERE (status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_platform_name_active_uq" ON "app"."roles" USING btree ("name") WHERE ((tenant_id IS NULL) AND (is_deleted = false));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_platform_system_key_active_uq" ON "app"."roles" USING btree ("system_key") WHERE ((tenant_id IS NULL) AND (system_key IS NOT NULL) AND (is_deleted = false));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_name_active_uq" ON "app"."roles" USING btree ("tenant_id","name") WHERE ((tenant_id IS NOT NULL) AND (is_deleted = false));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_system_key_active_uq" ON "app"."roles" USING btree ("tenant_id","system_key") WHERE ((tenant_id IS NOT NULL) AND (system_key IS NOT NULL) AND (is_deleted = false));--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_status_idx" ON "app"."subscriptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_identity_active_uq" ON "app"."templates" USING btree ("tenant_id","whatsapp_account_id","name","language") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "templates_tenant_approval_active_idx" ON "app"."templates" USING btree ("tenant_id","approval_status","updated_at") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "templates_tenant_status_active_idx" ON "app"."templates" USING btree ("tenant_id","provider_status") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_active_uq" ON "app"."tenants" USING btree ("slug") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "usage_events_period_idx" ON "app"."usage_events" USING btree ("tenant_id","occurred_at","event_type");--> statement-breakpoint
CREATE INDEX "user_tenant_scopes_tenant_active_idx" ON "app"."user_tenant_scopes" USING btree ("tenant_id","user_id") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_scopes_user_active_uq" ON "app"."user_tenant_scopes" USING btree ("user_id") WHERE (is_deleted = false);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_uq" ON "app"."users" USING btree (lower(email)) WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "users_home_tenant_active_idx" ON "app"."users" USING btree ("home_tenant_id","status") WHERE (is_deleted = false);--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "app"."webhook_events" USING btree ("status","received_at") WHERE (status = ANY (ARRAY['RECEIVED'::text, 'QUEUED'::text, 'FAILED'::text]));--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_one_default_uq" ON "app"."whatsapp_accounts" USING btree ("tenant_id") WHERE (is_default = true);--> statement-breakpoint
CREATE INDEX "whatsapp_accounts_tenant_status_idx" ON "app"."whatsapp_accounts" USING btree ("tenant_id","status");
--> statement-breakpoint
ALTER TABLE "app"."tenants" ADD CONSTRAINT "tenants_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app"."roles" ADD CONSTRAINT "roles_deleted_by_fk" FOREIGN KEY ("deleted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app"."automation_flows" ADD CONSTRAINT "automation_flows_published_version_fk" FOREIGN KEY ("tenant_id", "published_version_id") REFERENCES "app"."automation_versions"("tenant_id", "id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "plans_set_updated_at" BEFORE UPDATE ON "app"."plans" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "tenants_set_updated_at" BEFORE UPDATE ON "app"."tenants" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "subscriptions_set_updated_at" BEFORE UPDATE ON "app"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "roles_set_updated_at" BEFORE UPDATE ON "app"."roles" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "app"."users" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "user_tenant_scopes_set_updated_at" BEFORE UPDATE ON "app"."user_tenant_scopes" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "whatsapp_accounts_set_updated_at" BEFORE UPDATE ON "app"."whatsapp_accounts" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "provider_credentials_set_updated_at" BEFORE UPDATE ON "app"."provider_credentials" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "contacts_set_updated_at" BEFORE UPDATE ON "app"."contacts" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "contact_groups_set_updated_at" BEFORE UPDATE ON "app"."contact_groups" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "contact_group_members_set_updated_at" BEFORE UPDATE ON "app"."contact_group_members" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "templates_set_updated_at" BEFORE UPDATE ON "app"."templates" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "campaigns_set_updated_at" BEFORE UPDATE ON "app"."campaigns" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "conversations_set_updated_at" BEFORE UPDATE ON "app"."conversations" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "messages_set_updated_at" BEFORE UPDATE ON "app"."messages" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "campaign_recipients_set_updated_at" BEFORE UPDATE ON "app"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "automation_flows_set_updated_at" BEFORE UPDATE ON "app"."automation_flows" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "automation_runs_set_updated_at" BEFORE UPDATE ON "app"."automation_runs" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "media_assets_set_updated_at" BEFORE UPDATE ON "app"."media_assets" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "idempotency_keys_set_updated_at" BEFORE UPDATE ON "app"."idempotency_keys" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
