CREATE TYPE "public"."group_membership_source" AS ENUM('IMPORT', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."group_membership_status" AS ENUM('ACTIVE', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."identity_confidence" AS ENUM('HIGH', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."import_source_type" AS ENUM('DATABASE_ALL', 'KSB', 'GROUP_LIST');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('UPLOADING', 'STAGED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('MISSING_PHONE', 'INVALID_PHONE', 'MISSING_ORDER_ID', 'DUPLICATE_ORDER', 'UNKNOWN_PRODUCT', 'AMOUNT_CONFLICT', 'INVALID_DATE', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('PHYSICAL', 'DIGITAL', 'BOOK', 'SERVICE', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'CRM', 'MANAGEMENT');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('VALID', 'EXCLUDED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TABLE "cluster_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_code" text NOT NULL,
	"version" text NOT NULL,
	"priority" integer NOT NULL,
	"rule_definition" jsonb NOT NULL,
	"description" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cs_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_person" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_cluster_current" (
	"customer_id" integer PRIMARY KEY NOT NULL,
	"cluster_code" text NOT NULL,
	"rule_version" text NOT NULL,
	"reason" jsonb NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_cluster_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"cluster_code" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"rule_version" text NOT NULL,
	"reason" jsonb NOT NULL,
	"batch_id" integer
);
--> statement-breakpoint
CREATE TABLE "customer_group_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"group_code" text NOT NULL,
	"group_name" text,
	"joined_at" date,
	"status" "group_membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"source" "group_membership_source" NOT NULL,
	"source_list" text,
	"source_batch_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_rfm_current" (
	"customer_id" integer PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"recency_days" integer,
	"frequency" integer NOT NULL,
	"monetary" bigint NOT NULL,
	"first_order_date" date,
	"last_order_date" date,
	"avg_order_value" bigint,
	"customer_age_days" integer,
	"yacona_frequency" integer DEFAULT 0 NOT NULL,
	"cohort_month" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_phone" text NOT NULL,
	"display_phone" text,
	"name" text,
	"ksb_only" boolean DEFAULT false NOT NULL,
	"first_seen_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_batch_id" integer NOT NULL,
	"staging_row_id" bigint,
	"issue_type" "issue_type" NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" "import_source_type" NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" "import_status" DEFAULT 'UPLOADING' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"uploaded_by" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_of_date" date,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"excluded_rows" integer DEFAULT 0 NOT NULL,
	"needs_review_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "ksb_transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_transaction_key" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_id" integer,
	"transaction_date" date NOT NULL,
	"product_name" text NOT NULL,
	"amount" bigint NOT NULL,
	"source_batch_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" integer NOT NULL,
	"raw_product_name" text NOT NULL,
	"external_id" text,
	"qty" numeric,
	"amount" bigint NOT NULL,
	"is_bonus" boolean DEFAULT false NOT NULL,
	"identity_confidence" "identity_confidence" NOT NULL,
	"source_row_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_order_key" text NOT NULL,
	"customer_id" integer NOT NULL,
	"order_date" date NOT NULL,
	"order_total" bigint NOT NULL,
	"platform" text,
	"division" text,
	"payment_method" text,
	"partner" text,
	"cs_id" integer,
	"memo" text,
	"source_batch_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"product_id" integer NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" integer,
	"suggested_product_id" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" "product_category" NOT NULL,
	"is_probetes" boolean NOT NULL,
	"is_yacona" boolean DEFAULT false NOT NULL,
	"is_ebook" boolean DEFAULT false NOT NULL,
	"is_book_entry" boolean DEFAULT false NOT NULL,
	"is_hp_or_amandia" boolean DEFAULT false NOT NULL,
	"is_target_physical" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staging_import_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_batch_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"validation_status" "validation_status",
	"error_codes" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "customer_cluster_current" ADD CONSTRAINT "customer_cluster_current_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_cluster_history" ADD CONSTRAINT "customer_cluster_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_cluster_history" ADD CONSTRAINT "customer_cluster_history_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD CONSTRAINT "customer_group_memberships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD CONSTRAINT "customer_group_memberships_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_rfm_current" ADD CONSTRAINT "customer_rfm_current_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_first_seen_batch_id_import_batches_id_fk" FOREIGN KEY ("first_seen_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_staging_row_id_staging_import_rows_id_fk" FOREIGN KEY ("staging_row_id") REFERENCES "public"."staging_import_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ksb_transactions" ADD CONSTRAINT "ksb_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ksb_transactions" ADD CONSTRAINT "ksb_transactions_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cs_id_cs_agents_id_fk" FOREIGN KEY ("cs_id") REFERENCES "public"."cs_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_suggested_product_id_products_id_fk" FOREIGN KEY ("suggested_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_import_rows" ADD CONSTRAINT "staging_import_rows_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_rules_code_version_uq" ON "cluster_rules" USING btree ("cluster_code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "cs_agents_normalized_name_uq" ON "cs_agents" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "customer_cluster_current_code_idx" ON "customer_cluster_current" USING btree ("cluster_code");--> statement-breakpoint
CREATE INDEX "customer_cluster_history_customer_idx" ON "customer_cluster_history" USING btree ("customer_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_customer_code_uq" ON "customer_group_memberships" USING btree ("customer_id","group_code");--> statement-breakpoint
CREATE INDEX "customer_rfm_cohort_idx" ON "customer_rfm_current" USING btree ("cohort_month");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_uq" ON "customers" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "data_quality_batch_type_idx" ON "data_quality_issues" USING btree ("import_batch_id","issue_type");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_source_hash_uq" ON "import_batches" USING btree ("source_type","file_hash");--> statement-breakpoint
CREATE INDEX "import_batches_active_idx" ON "import_batches" USING btree ("source_type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "ksb_transactions_source_key_uq" ON "ksb_transactions" USING btree ("source_transaction_key");--> statement-breakpoint
CREATE INDEX "ksb_transactions_phone_date_idx" ON "ksb_transactions" USING btree ("customer_phone","transaction_date");--> statement-breakpoint
CREATE INDEX "ksb_transactions_customer_idx" ON "ksb_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_source_key_uq" ON "orders" USING btree ("source_order_key");--> statement-breakpoint
CREATE INDEX "orders_customer_date_idx" ON "orders" USING btree ("customer_id","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_normalized_name_uq" ON "product_aliases" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_uq" ON "products" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_rows_batch_row_uq" ON "staging_import_rows" USING btree ("import_batch_id","row_number");--> statement-breakpoint
CREATE INDEX "staging_rows_status_idx" ON "staging_import_rows" USING btree ("import_batch_id","validation_status");