CREATE TABLE "crm_report_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"crm_report_id" integer NOT NULL,
	"line_no" integer NOT NULL,
	"product_name" text NOT NULL,
	"qty" numeric DEFAULT '1' NOT NULL,
	"product_value" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"normalized_phone" text,
	"address" text,
	"expedition" text,
	"memo" text,
	"payment_method" text,
	"shipping_cost" bigint DEFAULT 0 NOT NULL,
	"packing_cost" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"admin_cod" bigint DEFAULT 0 NOT NULL,
	"total_payment" bigint DEFAULT 0 NOT NULL,
	"cs_name" text,
	"adv_name" text,
	"note" text,
	"hub" text,
	"city" text,
	"report_date" date NOT NULL,
	"order_closing_count" integer,
	"sales_type" text,
	"platform" text,
	"division" text,
	"data_received_count" integer,
	"crm_voucher" text,
	"cod_value" bigint DEFAULT 0 NOT NULL,
	"recipient_district" text,
	"recipient_postal_code" text,
	"partner" text,
	"crm_marketing_cost" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "manually_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_by" integer;--> statement-breakpoint
ALTER TABLE "crm_report_items" ADD CONSTRAINT "crm_report_items_crm_report_id_crm_reports_id_fk" FOREIGN KEY ("crm_report_id") REFERENCES "public"."crm_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_report_items_report_idx" ON "crm_report_items" USING btree ("crm_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_report_items_report_line_uq" ON "crm_report_items" USING btree ("crm_report_id","line_no");--> statement-breakpoint
CREATE INDEX "crm_reports_date_idx" ON "crm_reports" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "crm_reports_customer_idx" ON "crm_reports" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_reports_archived_idx" ON "crm_reports" USING btree ("archived_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_archived_idx" ON "customers" USING btree ("archived_at");