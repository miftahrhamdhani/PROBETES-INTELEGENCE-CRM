-- Bersihkan data lama yang melanggar aturan "status non-DRAFT wajib punya
-- source_order_id" (No Order/ID Pesanan Everpro) SEBELUM constraint di bawah
-- ditegakkan — kalau tidak, ALTER TABLE ini gagal karena masih ada baris yang
-- melanggar (mis. data seed/E2E lama yang sempat CONFIRMED/CANCELLED tanpa
-- No Order, dari sebelum aturan ini ada). Baris yang terkena direset balik ke
-- DRAFT; metadata transisi lama (confirmed/cancelled/returned/refunded) ikut
-- dikosongkan supaya tidak ada jejak basi yang menempel di status DRAFT.
UPDATE "workspace_orders"
SET "status" = 'DRAFT',
    "confirmed_at" = NULL, "confirmed_by" = NULL,
    "cancelled_at" = NULL, "cancelled_by" = NULL, "cancel_reason" = NULL,
    "returned_at" = NULL, "returned_by" = NULL, "return_reason" = NULL,
    "refunded_at" = NULL, "refunded_by" = NULL, "refund_reason" = NULL, "refund_amount" = NULL,
    "updated_at" = now()
WHERE "source_order_id" IS NULL AND "status" <> 'DRAFT';
--> statement-breakpoint
ALTER TABLE "workspace_orders" ADD CONSTRAINT "workspace_orders_status_requires_source_order_id_ck" CHECK ("workspace_orders"."status" = 'DRAFT' OR "workspace_orders"."source_order_id" IS NOT NULL);
