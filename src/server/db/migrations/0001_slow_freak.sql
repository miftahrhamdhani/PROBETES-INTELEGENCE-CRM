ALTER TABLE "order_items" ADD COLUMN "source_item_key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_cluster_history_open_uq" ON "customer_cluster_history" USING btree ("customer_id") WHERE "customer_cluster_history"."valid_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_one_active_uq" ON "import_batches" USING btree ("source_type") WHERE "import_batches"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_source_key_uq" ON "order_items" USING btree ("source_item_key");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_active_completed_ck" CHECK ("import_batches"."is_active" = false OR "import_batches"."status" = 'COMPLETED');