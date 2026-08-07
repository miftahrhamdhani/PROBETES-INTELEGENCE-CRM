ALTER TABLE "crm_tasks" ADD COLUMN "deleted_from_status" "crm_task_status";
ALTER TABLE "crm_tasks" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "crm_tasks" ADD COLUMN "deleted_by" integer;
UPDATE "crm_tasks" SET "deleted_from_status" = 'UNASSIGNED', "deleted_at" = "updated_at" WHERE "status" = 'CANCELLED';
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "crm_tasks_deleted_at_idx" ON "crm_tasks" USING btree ("deleted_at");
