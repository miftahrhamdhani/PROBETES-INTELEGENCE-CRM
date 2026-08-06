ALTER TABLE "workspace_orders" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "deleted_by" integer;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;