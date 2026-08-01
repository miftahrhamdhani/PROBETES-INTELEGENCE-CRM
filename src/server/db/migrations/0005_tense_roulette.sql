ALTER TABLE "customer_group_memberships" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."customer_group_memberships" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."group_membership_source";--> statement-breakpoint
CREATE TYPE "public"."group_membership_source" AS ENUM('LEGACY_MASUK_WA', 'LEGACY_BACKUP_MASUK_GRUP', 'LEGACY_TIDAK_MASUK_WA', 'CRM_MANUAL');--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "source" SET DATA TYPE "public"."group_membership_source" USING "source"::"public"."group_membership_source";--> statement-breakpoint
ALTER TABLE "public"."customer_group_memberships" ALTER COLUMN "source" SET DATA TYPE "public"."group_membership_source" USING "source"::"public"."group_membership_source";--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "old_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "new_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."customer_group_memberships" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."group_membership_status";--> statement-breakpoint
CREATE TYPE "public"."group_membership_status" AS ENUM('GROUPED', 'NOT_GROUPED', 'UNKNOWN');--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "old_status" SET DATA TYPE "public"."group_membership_status" USING "old_status"::"public"."group_membership_status";--> statement-breakpoint
ALTER TABLE "public"."customer_group_membership_history" ALTER COLUMN "new_status" SET DATA TYPE "public"."group_membership_status" USING "new_status"::"public"."group_membership_status";--> statement-breakpoint
ALTER TABLE "public"."customer_group_memberships" ALTER COLUMN "status" SET DATA TYPE "public"."group_membership_status" USING "status"::"public"."group_membership_status";--> statement-breakpoint
ALTER TABLE "customer_group_memberships" ALTER COLUMN "status" SET DEFAULT 'UNKNOWN';
