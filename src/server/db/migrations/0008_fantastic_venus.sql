CREATE TYPE "public"."crm_task_outcome" AS ENUM('NO_RESPONSE', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED', 'JOINED_GROUP', 'CLOSING', 'FOLLOW_UP_AGAIN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."crm_task_status" AS ENUM('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."crm_task_type" AS ENUM('FOLLOW_UP_NEW_CUSTOMER', 'FOLLOW_UP_REPEAT', 'BROADCAST', 'INVITE_GROUP', 'OTHER');--> statement-breakpoint
CREATE TABLE "crm_task_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"from_status" "crm_task_status",
	"to_status" "crm_task_status" NOT NULL,
	"note" text,
	"changed_by" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"task_type" "crm_task_type" NOT NULL,
	"status" "crm_task_status" DEFAULT 'UNASSIGNED' NOT NULL,
	"assigned_to" integer,
	"assigned_by" integer,
	"assigned_at" timestamp with time zone,
	"due_at" date,
	"completed_at" timestamp with time zone,
	"completed_by" integer,
	"outcome" "crm_task_outcome",
	"notes" text,
	"detected_from_batch_id" integer,
	"first_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_reports" ADD COLUMN "task_id" integer;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_detected_from_batch_id_import_batches_id_fk" FOREIGN KEY ("detected_from_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_task_history_task_idx" ON "crm_task_history" USING btree ("task_id","changed_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_status_idx" ON "crm_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_tasks_assigned_to_idx" ON "crm_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "crm_tasks_customer_idx" ON "crm_tasks" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_due_at_idx" ON "crm_tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_created_at_idx" ON "crm_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_type_idx" ON "crm_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_tasks_new_customer_uq" ON "crm_tasks" USING btree ("customer_id") WHERE "crm_tasks"."task_type" = 'FOLLOW_UP_NEW_CUSTOMER';--> statement-breakpoint
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_reports_task_idx" ON "crm_reports" USING btree ("task_id");