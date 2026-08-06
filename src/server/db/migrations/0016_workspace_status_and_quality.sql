CREATE TYPE "public"."workspace_unmapped_product_status" AS ENUM('PENDING', 'RESOLVED', 'IGNORED');--> statement-breakpoint
ALTER TYPE "public"."workspace_order_status" ADD VALUE 'RETURNED';--> statement-breakpoint
ALTER TYPE "public"."workspace_order_status" ADD VALUE 'REFUNDED';--> statement-breakpoint
ALTER TYPE "public"."workspace_order_status" ADD VALUE 'PARTIALLY_REFUNDED';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "workspace_generation" text DEFAULT 'CRM_FRESH_V1' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "source" text DEFAULT 'DATABASE_ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "sample_source_order_id" text;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "sample_customer_name" text;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "sample_order_date" date;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "status" "workspace_unmapped_product_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "mapped_product_id" integer;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD CONSTRAINT "workspace_unmapped_products_mapped_product_id_workspace_products_id_fk" FOREIGN KEY ("mapped_product_id") REFERENCES "public"."workspace_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_unmapped_products" ADD CONSTRAINT "workspace_unmapped_products_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_unmapped_products_status_idx" ON "workspace_unmapped_products" USING btree ("status");