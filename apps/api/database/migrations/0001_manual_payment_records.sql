CREATE TABLE "app"."payment_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "recorded_by" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL,
  "paid_at" timestamp with time zone NOT NULL,
  "reference" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_records_tenant_reference_key" UNIQUE("tenant_id","reference"),
  CONSTRAINT "payment_records_amount_minor_check" CHECK (amount_minor > 0),
  CONSTRAINT "payment_records_currency_check" CHECK (currency ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "app"."payment_records" ADD CONSTRAINT "payment_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app"."payment_records" ADD CONSTRAINT "payment_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payment_records_tenant_paid_idx" ON "app"."payment_records" USING btree ("tenant_id","paid_at" DESC NULLS LAST);
