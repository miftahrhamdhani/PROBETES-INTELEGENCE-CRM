DROP INDEX "crm_reports_task_idx";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM crm_reports WHERE task_id IS NOT NULL GROUP BY task_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'crm_reports.task_id duplikat; audit dan perbaiki provenance sebelum migrasi';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_reports_task_uq" ON "crm_reports" USING btree ("task_id");