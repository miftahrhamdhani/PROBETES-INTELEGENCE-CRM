DROP INDEX "workspace_orders_match_fingerprint_idx";--> statement-breakpoint
DROP INDEX "workspace_orders_source_id_uq";--> statement-breakpoint
DROP INDEX "workspace_orders_fingerprint_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_match_fingerprint_uq" ON "workspace_orders" USING btree ("workspace_generation","match_fingerprint") WHERE "workspace_orders"."match_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_orders_generation_idx" ON "workspace_orders" USING btree ("workspace_generation");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_source_id_uq" ON "workspace_orders" USING btree ("workspace_generation","source_type","source_order_id") WHERE "workspace_orders"."source_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_orders_fingerprint_uq" ON "workspace_orders" USING btree ("workspace_generation","deterministic_fingerprint") WHERE "workspace_orders"."deterministic_fingerprint" IS NOT NULL;