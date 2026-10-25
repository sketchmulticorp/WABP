CREATE TABLE "app"."campaign_preflight_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"content_version" integer NOT NULL,
	"status" text NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"requested_by" uuid NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "campaign_preflight_runs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "campaign_preflight_runs_content_version_check" CHECK (content_version > 0),
	CONSTRAINT "campaign_preflight_runs_status_check" CHECK (status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'SUPERSEDED'::text]))
);
--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD COLUMN "preflight_run_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."campaign_preflight_runs" ADD CONSTRAINT "campaign_preflight_runs_tenant_campaign_fk" FOREIGN KEY ("tenant_id","campaign_id") REFERENCES "app"."campaigns"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_preflight_runs" ADD CONSTRAINT "campaign_preflight_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_preflight_runs" ADD CONSTRAINT "campaign_preflight_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_preflight_runs_one_active_idx" ON "app"."campaign_preflight_runs" USING btree ("campaign_id") WHERE status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text]);--> statement-breakpoint
CREATE INDEX "campaign_preflight_runs_tenant_campaign_idx" ON "app"."campaign_preflight_runs" USING btree ("tenant_id","campaign_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_preflight_run_fk" FOREIGN KEY ("tenant_id","preflight_run_id") REFERENCES "app"."campaign_preflight_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaign_recipients" ADD CONSTRAINT "campaign_recipients_content_version_check" CHECK (content_version > 0);