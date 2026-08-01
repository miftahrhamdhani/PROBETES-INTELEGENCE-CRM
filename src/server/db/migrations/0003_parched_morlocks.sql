ALTER TYPE "public"."issue_type" ADD VALUE 'GROUP_STATUS_CONFLICT';--> statement-breakpoint
CREATE TABLE "customer_group_membership_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"old_status" "group_membership_status",
	"new_status" "group_membership_status" NOT NULL,
	"source" "group_membership_source" NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD COLUMN "pic_user_id" integer;--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "customer_group_membership_history" ADD CONSTRAINT "customer_group_membership_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_membership_history" ADD CONSTRAINT "customer_group_membership_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_group_membership_history_customer_idx" ON "customer_group_membership_history" USING btree ("customer_id","changed_at");--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD CONSTRAINT "customer_group_memberships_pic_user_id_users_id_fk" FOREIGN KEY ("pic_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ADD CONSTRAINT "customer_group_memberships_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;