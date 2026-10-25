ALTER TABLE "app"."campaigns" ADD COLUMN "schedule_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "template_content_version" integer;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "start_key" text;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "start_hash" text;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "delivery_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "final_preflight_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_delivery_requested_by_fkey" FOREIGN KEY ("delivery_requested_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_tenant_final_preflight_fk" FOREIGN KEY ("tenant_id","final_preflight_id") REFERENCES "app"."campaign_preflight_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."campaigns" ADD CONSTRAINT "campaigns_template_content_version_check" CHECK (template_content_version > 0);