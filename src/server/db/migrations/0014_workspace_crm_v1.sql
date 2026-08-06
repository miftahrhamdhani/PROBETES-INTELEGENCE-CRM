CREATE TYPE "public"."workspace_cost_category" AS ENUM('BROADCAST', 'MEKARI_QONTAK', 'WHATSAPP_API', 'AI_CRM', 'SOFTWARE_CRM', 'CAMPAIGN_CRM', 'DATABASE_LEADS', 'SAMPLE_PROMOSI', 'COM_LAINNYA');--> statement-breakpoint
CREATE TYPE "public"."workspace_cost_status" AS ENUM('DRAFT', 'SUBMITTED', 'LEADER_VERIFIED', 'SPV_APPROVED', 'DIRECTOR_APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."workspace_item_type" AS ENUM('SALE', 'BONUS', 'SAMPLE');--> statement-breakpoint
CREATE TYPE "public"."workspace_order_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."workspace_payment_method" AS ENUM('COD', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."workspace_product_usage" AS ENUM('SELLABLE', 'BONUS_ONLY', 'SELLABLE_AND_BONUS', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "workspace_cutover_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"cutover_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"reason" text NOT NULL,
	"legacy_excluded_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_operational_costs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cost_date" date NOT NULL,
	"cost_name" text NOT NULL,
	"amount" bigint NOT NULL,
	"category" "workspace_cost_category" NOT NULL,
	"vendor" text,
	"usage_period" text,
	"payment_method" text,
	"reference_number" text,
	"proof_url" text,
	"notes" text,
	"status" "workspace_cost_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"leader_verified_by" integer,
	"leader_verified_at" timestamp with time zone,
	"spv_approved_by" integer,
	"spv_approved_at" timestamp with time zone,
	"director_approved_by" integer,
	"director_approved_at" timestamp with time zone,
	"revision_reason" text,
	"reject_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_costs_amount_ck" CHECK ("workspace_operational_costs"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"item_type" "workspace_item_type" NOT NULL,
	"quantity" numeric NOT NULL,
	"selling_price_snapshot" bigint DEFAULT 0 NOT NULL,
	"unit_hpp_snapshot" bigint DEFAULT 0 NOT NULL,
	"total_sales_value" bigint DEFAULT 0 NOT NULL,
	"total_hpp" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_order_items_qty_ck" CHECK ("workspace_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"source_type" text DEFAULT 'MANUAL' NOT NULL,
	"source_order_id" text,
	"deterministic_fingerprint" text,
	"order_date" date NOT NULL,
	"customer_name" text NOT NULL,
	"normalized_phone" text NOT NULL,
	"phone_display" text,
	"address" text,
	"city" text,
	"district" text,
	"postal_code" text,
	"expedition" text,
	"hub" text,
	"payment_method" "workspace_payment_method" NOT NULL,
	"memo" text,
	"partner" text,
	"crm_user_id" integer,
	"crm_name_snapshot" text NOT NULL,
	"sales_type" text,
	"sales_source" text,
	"shipping_charge" bigint DEFAULT 0 NOT NULL,
	"packing_charge" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"cod_admin" bigint DEFAULT 0 NOT NULL,
	"crm_voucher" bigint DEFAULT 0 NOT NULL,
	"total_sales_value" bigint DEFAULT 0 NOT NULL,
	"order_total" bigint DEFAULT 0 NOT NULL,
	"cod_value" bigint DEFAULT 0 NOT NULL,
	"status" "workspace_order_status" DEFAULT 'DRAFT' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" integer,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" integer,
	"cancel_reason" text,
	"import_batch_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_orders_total_ck" CHECK ("workspace_orders"."order_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"source_system" text DEFAULT 'DATABASE_ALL' NOT NULL,
	"alias_name" text NOT NULL,
	"alias_normalized" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"selling_price" bigint,
	"unit_hpp" bigint NOT NULL,
	"product_usage" "workspace_product_usage" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_products_selling_price_ck" CHECK ("workspace_products"."selling_price" IS NULL OR "workspace_products"."selling_price" >= 0),
	CONSTRAINT "workspace_products_hpp_ck" CHECK ("workspace_products"."unit_hpp" >= 0),
	CONSTRAINT "workspace_products_sellable_price_ck" CHECK ("workspace_products"."product_usage" NOT IN ('SELLABLE','SELLABLE_AND_BONUS') OR "workspace_products"."selling_price" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "workspace_order_id" bigint;--> statement-breakpoint
ALTER TABLE "workspace_cutover_log" ADD CONSTRAINT "workspace_cutover_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operational_costs" ADD CONSTRAINT "workspace_operational_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operational_costs" ADD CONSTRAINT "workspace_operational_costs_leader_verified_by_users_id_fk" FOREIGN KEY ("leader_verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operational_costs" ADD CONSTRAINT "workspace_operational_costs_spv_approved_by_users_id_fk" FOREIGN KEY ("spv_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operational_costs" ADD CONSTRAINT "workspace_operational_costs_director_approved_by_users_id_fk" FOREIGN KEY ("director_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operational_costs" ADD CONSTRAINT "workspace_operational_costs_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_order_items" ADD CONSTRAINT "workspace_order_items_order_id_workspace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."workspace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_order_items" ADD CONSTRAINT "workspace_order_items_product_id_workspace_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."workspace_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_crm_user_id_users_id_fk" FOREIGN KEY ("crm_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_product_aliases" ADD CONSTRAINT "workspace_product_aliases_product_id_workspace_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."workspace_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_product_aliases" ADD CONSTRAINT "workspace_product_aliases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_products" ADD CONSTRAINT "workspace_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_products" ADD CONSTRAINT "workspace_products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_costs_date_idx" ON "workspace_operational_costs" USING btree ("cost_date");--> statement-breakpoint
CREATE INDEX "workspace_costs_status_idx" ON "workspace_operational_costs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspace_costs_category_idx" ON "workspace_operational_costs" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_order_items_order_line_uq" ON "workspace_order_items" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE INDEX "workspace_order_items_order_idx" ON "workspace_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "workspace_order_items_product_idx" ON "workspace_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_order_number_uq" ON "workspace_orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_source_id_uq" ON "workspace_orders" USING btree ("source_type","source_order_id") WHERE "workspace_orders"."source_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_fingerprint_uq" ON "workspace_orders" USING btree ("deterministic_fingerprint") WHERE "workspace_orders"."deterministic_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_orders_date_idx" ON "workspace_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "workspace_orders_status_idx" ON "workspace_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspace_orders_crm_user_idx" ON "workspace_orders" USING btree ("crm_user_id");--> statement-breakpoint
CREATE INDEX "workspace_orders_phone_idx" ON "workspace_orders" USING btree ("normalized_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_product_aliases_normalized_uq" ON "workspace_product_aliases" USING btree ("alias_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_products_product_id_uq" ON "workspace_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "workspace_products_usage_idx" ON "workspace_products" USING btree ("product_usage");--> statement-breakpoint
CREATE INDEX "workspace_products_active_idx" ON "workspace_products" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_order_id_workspace_orders_id_fk" FOREIGN KEY ("workspace_order_id") REFERENCES "public"."workspace_orders"("id") ON DELETE no action ON UPDATE no action;