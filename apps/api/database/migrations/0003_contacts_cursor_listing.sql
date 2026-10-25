CREATE INDEX "contacts_tenant_created_active_idx"
  ON "app"."contacts" USING btree ("tenant_id", "created_at" DESC, "id" DESC)
  WHERE "app"."contacts"."is_deleted" = false;
