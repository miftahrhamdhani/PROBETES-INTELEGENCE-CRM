ALTER TABLE "workspace_orders" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "returned_by" integer;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "refunded_by" integer;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "refund_amount" bigint;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_refund_amount_ck" CHECK ("workspace_orders"."refund_amount" IS NULL OR ("workspace_orders"."refund_amount" >= 0 AND "workspace_orders"."refund_amount" <= "workspace_orders"."order_total"));