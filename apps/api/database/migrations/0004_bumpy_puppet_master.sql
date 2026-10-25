ALTER TABLE "app"."contacts" ADD COLUMN "consent_proof_reference" text;--> statement-breakpoint
ALTER TABLE "app"."contacts"
  ADD CONSTRAINT "contacts_opted_in_evidence_ck"
  CHECK (
    (consent_status <> 'OPTED_IN')
    OR (
      (consent_source IS NOT NULL)
      AND (consent_at IS NOT NULL)
      AND (consent_proof_reference IS NOT NULL)
    )
  );
