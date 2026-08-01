ALTER TYPE "public"."issue_type" ADD VALUE 'MISSING_NAME' BEFORE 'MISSING_ORDER_ID';--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "manually_created";