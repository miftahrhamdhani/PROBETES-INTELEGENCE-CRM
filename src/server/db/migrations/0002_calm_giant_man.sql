ALTER TYPE "public"."issue_type" ADD VALUE 'SKIPPED_NON_KSB_FROM_LEGACY';--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "is_yacona" TO "is_ksb_product";