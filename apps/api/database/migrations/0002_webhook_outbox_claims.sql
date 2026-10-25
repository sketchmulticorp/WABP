ALTER TABLE "app"."outbox_events"
  ADD COLUMN "locked_at" timestamp with time zone,
  ADD COLUMN "locked_by" text;
--> statement-breakpoint
ALTER TABLE "app"."outbox_events"
  DROP CONSTRAINT "outbox_events_status_check";
--> statement-breakpoint
ALTER TABLE "app"."outbox_events"
  ADD CONSTRAINT "outbox_events_status_check"
  CHECK ("status" = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'PUBLISHED'::text, 'FAILED'::text]));
