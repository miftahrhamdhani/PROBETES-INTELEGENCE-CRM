DROP INDEX "customer_group_customer_code_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_memberships_customer_uq" ON "customer_group_memberships" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customer_group_memberships" DROP COLUMN "group_code";--> statement-breakpoint
ALTER TABLE "customer_group_memberships" DROP COLUMN "source_list";