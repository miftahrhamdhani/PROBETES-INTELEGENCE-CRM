CREATE TABLE "workspace_unmapped_products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_product_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"import_batch_id" integer,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "match_fingerprint" text;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD CONSTRAINT "workspace_unmapped_products_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_unmapped_products_normalized_uq" ON "workspace_unmapped_products" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "workspace_unmapped_products_batch_idx" ON "workspace_unmapped_products" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "workspace_orders_match_fingerprint_idx" ON "workspace_orders" USING btree ("match_fingerprint");