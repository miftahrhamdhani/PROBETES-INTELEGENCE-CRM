CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."crm_hpp_status" AS ENUM('KNOWN', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."crm_reconciliation_status" AS ENUM('PENDING', 'MATCH_CANDIDATE', 'RECONCILED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."crm_transaction_status" AS ENUM('CONFIRMED', 'CANCELLED', 'COD_FAILED', 'RETURNED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ADJUSTED');--> statement-breakpoint
CREATE TABLE "crm_audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"reason" text,
	"request_reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_lead_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_batch_id" text,
	"report_reference" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"received_at" timestamp with time zone,
	"leads_received" integer NOT NULL,
	"attributed_user_id" integer,
	"attributed_product_id" integer,
	"attributed_sales_type" text,
	"attributed_hub" text,
	"import_batch_id" integer,
	"official" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_lead_batches_identity_ck" CHECK ("crm_lead_batches"."source_batch_id" IS NOT NULL OR "crm_lead_batches"."report_reference" IS NOT NULL),
	CONSTRAINT "crm_lead_batches_period_ck" CHECK ("crm_lead_batches"."period_end" >= "crm_lead_batches"."period_start"),
	CONSTRAINT "crm_lead_batches_count_ck" CHECK ("crm_lead_batches"."leads_received" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crm_order_adjustments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"source" text NOT NULL,
	"source_adjustment_id" text,
	"deterministic_fingerprint" text,
	"adjustment_type" text NOT NULL,
	"effective_date" date NOT NULL,
	"closing_delta" integer DEFAULT 0 NOT NULL,
	"revenue_delta" bigint DEFAULT 0 NOT NULL,
	"quantity_delta" numeric DEFAULT '0' NOT NULL,
	"cos_delta" bigint DEFAULT 0 NOT NULL,
	"com_delta" bigint DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_adjustments_identity_ck" CHECK ("crm_order_adjustments"."source_adjustment_id" IS NOT NULL OR "crm_order_adjustments"."deterministic_fingerprint" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "crm_reconciliations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"manual_report_id" integer NOT NULL,
	"official_order_id" bigint NOT NULL,
	"status" "crm_reconciliation_status" DEFAULT 'MATCH_CANDIDATE' NOT NULL,
	"match_method" text NOT NULL,
	"match_reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"activity_type" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_hpp_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"unit_hpp" bigint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_hpp_nonnegative_ck" CHECK ("product_hpp_history"."unit_hpp" >= 0),
	CONSTRAINT "product_hpp_range_ck" CHECK ("product_hpp_history"."effective_to" IS NULL OR "product_hpp_history"."effective_to" > "product_hpp_history"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "unit_hpp_snapshot" bigint;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "total_hpp" bigint;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "hpp_status" "crm_hpp_status" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocation_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocated_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocated_packing" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocated_admin_cod" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocated_voucher" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "allocated_com" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD COLUMN "net_item_revenue" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "source_type" text DEFAULT 'CRM_MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "reconciliation_status" "crm_reconciliation_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "transaction_status" "crm_transaction_status" DEFAULT 'CONFIRMED' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "deterministic_fingerprint" text;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "official_order_id" bigint;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "first_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "selling_price" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "gross_item_value" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_hpp_snapshot" bigint;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "total_hpp" bigint;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "hpp_status" "crm_hpp_status" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocation_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocated_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocated_packing" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocated_admin_cod" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocated_voucher" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "allocated_com" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "net_item_revenue" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "workspace_total" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source_type" text DEFAULT 'DATABASE_ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deterministic_fingerprint" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fingerprint_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transaction_status" "crm_transaction_status" DEFAULT 'CONFIRMED' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_crm_transaction" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "crm_inclusion_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "crm_mapping_version" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hub" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sales_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packing_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "admin_cod" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "crm_voucher" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_value" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "crm_marketing_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_closing_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "order_items" SET "selling_price" = "amount", "gross_item_value" = "amount", "allocation_sequence" = "source_row_number", "net_item_revenue" = "amount";--> statement-breakpoint
UPDATE "orders" SET
  "workspace_total" = "order_total",
  "deterministic_fingerprint" = md5('v1|' || "source_order_key"),
  "is_crm_transaction" = CASE WHEN upper(coalesce("division", '')) = 'CRM' AND upper(coalesce("platform", '')) NOT IN ('TIKTOK', 'SHOPEE', 'MARKETPLACE', 'META') THEN true ELSE false END,
  "crm_inclusion_reason" = CASE WHEN upper(coalesce("division", '')) = 'CRM' AND upper(coalesce("platform", '')) NOT IN ('TIKTOK', 'SHOPEE', 'MARKETPLACE', 'META') THEN 'DIVISION_CRM' END,
  "crm_mapping_version" = 'v1';--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD COLUMN "is_crm_transaction" boolean;--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD COLUMN "crm_inclusion_reason" text;--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD COLUMN "crm_exclusion_reason" text;--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD COLUMN "crm_mapping_version" text;--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_audit_logs" ADD CONSTRAINT "crm_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_batches" ADD CONSTRAINT "crm_lead_batches_attributed_user_id_users_id_fk" FOREIGN KEY ("attributed_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_batches" ADD CONSTRAINT "crm_lead_batches_attributed_product_id_products_id_fk" FOREIGN KEY ("attributed_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_batches" ADD CONSTRAINT "crm_lead_batches_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_order_adjustments" ADD CONSTRAINT "crm_order_adjustments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_order_adjustments" ADD CONSTRAINT "crm_order_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reconciliations" ADD CONSTRAINT "crm_reconciliations_manual_report_id_crm_reports_id_fk" FOREIGN KEY ("manual_report_id") REFERENCES "public"."crm_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reconciliations" ADD CONSTRAINT "crm_reconciliations_official_order_id_orders_id_fk" FOREIGN KEY ("official_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reconciliations" ADD CONSTRAINT "crm_reconciliations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_activities" ADD CONSTRAINT "crm_task_activities_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_activities" ADD CONSTRAINT "crm_task_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_hpp_history" ADD CONSTRAINT "product_hpp_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_hpp_history" ADD CONSTRAINT "product_hpp_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_audit_entity_idx" ON "crm_audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_batches_source_batch_uq" ON "crm_lead_batches" USING btree ("source","source_batch_id") WHERE "crm_lead_batches"."source_batch_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_batches_report_ref_uq" ON "crm_lead_batches" USING btree ("source","report_reference") WHERE "crm_lead_batches"."source_batch_id" IS NULL AND "crm_lead_batches"."report_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "crm_lead_batches_period_idx" ON "crm_lead_batches" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_adjustments_source_id_uq" ON "crm_order_adjustments" USING btree ("source","source_adjustment_id") WHERE "crm_order_adjustments"."source_adjustment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_adjustments_fingerprint_uq" ON "crm_order_adjustments" USING btree ("deterministic_fingerprint") WHERE "crm_order_adjustments"."source_adjustment_id" IS NULL AND "crm_order_adjustments"."deterministic_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "crm_adjustments_order_date_idx" ON "crm_order_adjustments" USING btree ("order_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_reconciliations_pair_uq" ON "crm_reconciliations" USING btree ("manual_report_id","official_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_reconciliations_manual_reconciled_uq" ON "crm_reconciliations" USING btree ("manual_report_id") WHERE "crm_reconciliations"."status" = 'RECONCILED';--> statement-breakpoint
CREATE UNIQUE INDEX "crm_reconciliations_official_reconciled_uq" ON "crm_reconciliations" USING btree ("official_order_id") WHERE "crm_reconciliations"."status" = 'RECONCILED';--> statement-breakpoint
CREATE INDEX "crm_reconciliations_status_idx" ON "crm_reconciliations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_task_activities_task_idx" ON "crm_task_activities" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "product_hpp_product_date_idx" ON "product_hpp_history" USING btree ("product_id","effective_from");--> statement-breakpoint
ALTER TABLE "product_hpp_history" ADD CONSTRAINT "product_hpp_no_overlap_excl" EXCLUDE USING gist ("product_id" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&);--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD CONSTRAINT "crm_report_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_official_order_id_orders_id_fk" FOREIGN KEY ("official_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_fingerprint_uq" ON "orders" USING btree ("deterministic_fingerprint");--> statement-breakpoint
CREATE INDEX "orders_workspace_date_idx" ON "orders" USING btree ("is_crm_transaction","order_date");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("transaction_status");--> statement-breakpoint
CREATE INDEX "orders_cs_idx" ON "orders" USING btree ("cs_id");