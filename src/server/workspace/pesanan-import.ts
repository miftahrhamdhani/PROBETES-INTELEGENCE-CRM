import type { TransactionClient } from "@/server/db/transaction";
import { createOrderFingerprint } from "@/server/workspace/classification";
import { normalizeProductAlias } from "@/server/workspace/products";
import { mapImportStatusToWorkspace } from "@/lib/workspace-import-status";
import type { NormalizedDailyOrder } from "@/server/import/types";

type WorkspaceProductLookup = {
  id: number;
  productId: string;
  productName: string;
  sellingPrice: bigint | null;
  unitHpp: bigint;
};

export type WorkspaceImportSummary = {
  ordersIngested: number;
  ordersConvertedFromManual: number;
  ordersSkippedUnmappedProduct: number;
  ordersSkippedNegativeTotal: number;
  ordersHeldAdjustedStatus: number;
  unmappedProductNames: number;
};

function normalizePaymentMethod(value: string): "COD" | "TRANSFER" {
  return /COD/i.test(value) ? "COD" : "TRANSFER";
}

async function loadActiveCutoverDate(client: TransactionClient): Promise<string | null> {
  const result = await client.query<{ cutover_date: string }>(
    "SELECT cutover_at::date::text AS cutover_date FROM workspace_cutover_log ORDER BY cutover_at DESC LIMIT 1"
  );
  return result.rows[0]?.cutover_date ?? null;
}

async function loadProductLookup(client: TransactionClient): Promise<Map<string, WorkspaceProductLookup>> {
  const products = await client.query<{ id: number; product_id: string; product_name: string; selling_price: string | null; unit_hpp: string }>(
    "SELECT id, product_id, product_name, selling_price, unit_hpp FROM workspace_products WHERE is_active = true"
  );
  const byId = new Map(products.rows.map((row) => [row.id, { id: row.id, productId: row.product_id, productName: row.product_name, sellingPrice: row.selling_price != null ? BigInt(row.selling_price) : null, unitHpp: BigInt(row.unit_hpp) }]));

  const lookup = new Map<string, WorkspaceProductLookup>();
  for (const product of byId.values()) lookup.set(normalizeProductAlias(product.productName), product);

  const aliases = await client.query<{ alias_normalized: string; product_id: number }>(
    "SELECT alias_normalized, product_id FROM workspace_product_aliases WHERE is_active = true"
  );
  for (const alias of aliases.rows) {
    const product = byId.get(alias.product_id);
    if (product) lookup.set(alias.alias_normalized, product);
  }
  return lookup;
}

async function recordUnmappedProduct(
  client: TransactionClient,
  rawName: string,
  batchId: number,
  context: { sourceOrderId: string; customerName: string; orderDate: string; rawPayload: Record<string, unknown> }
): Promise<void> {
  const normalized = normalizeProductAlias(rawName);
  await client.query(
    `INSERT INTO workspace_unmapped_products
       (source, raw_product_name, normalized_name, import_batch_id, sample_source_order_id, sample_customer_name,
        sample_order_date, raw_payload, status, occurrence_count, last_seen_at)
     VALUES ('DATABASE_ALL', $1, $2, $3, $4, $5, $6::date, $7::jsonb, 'PENDING', 1, now())
     ON CONFLICT (normalized_name) DO UPDATE SET
       occurrence_count = workspace_unmapped_products.occurrence_count + 1,
       last_seen_at = now(),
       import_batch_id = $3,
       sample_source_order_id = $4,
       sample_customer_name = $5,
       sample_order_date = $6::date,
       raw_payload = $7::jsonb,
       -- Kejadian baru pada produk yang sebelumnya sudah RESOLVED/IGNORED berarti
       -- ada order baru yang masih pakai nama mentah ini — buka kembali sebagai PENDING.
       status = 'PENDING'::workspace_unmapped_product_status`,
    [rawName, normalized, batchId, context.sourceOrderId, context.customerName, context.orderDate, JSON.stringify(context.rawPayload)]
  );
}

/**
 * ⛔ DINONAKTIFKAN — JANGAN DIPANGGIL LAGI DARI MANA PUN.
 *
 * Batas domain: Database All adalah domain Analysis / Customer Intelligence dan
 * TIDAK BOLEH membuat `workspace_orders`/`workspace_order_items`. Fungsi ini
 * dulu dipanggil dari commitDatabaseAllImport() dan dari retry produk tak
 * dikenal, sehingga order berprovenance `DATABASE_ALL` bocor ke Workspace
 * Pesanan/KPI/Overview/export. Kedua pemanggilan sudah dicabut; provenance
 * Workspace yang sah hanya `MANUAL` — lihat src/server/workspace/provenance.ts.
 *
 * Kodenya sengaja TIDAK dihapus (bukan cleanup besar, dan jejak logika
 * dedup/fingerprint-nya masih berguna sebagai rujukan), tapi
 * tests/workspace-provenance-boundary.test.ts mengunci agar tidak ada modul
 * produksi yang meng-import-nya kembali.
 *
 * ---- dokumentasi historis di bawah ini ----
 *
 * Ingest workspace_orders/workspace_order_items dari hasil parse Database All
 * (docs prompt §10). HANYA order yang: (a) diklasifikasi CRM (`crmClassification.included`),
 * (b) `orderDate >= cutover`, DAN (c) semua produknya sudah punya alias Master
 * Data — order dengan produk tak dikenal DILEWATI SELURUHNYA (bukan sebagian)
 * dan dicatat ke `workspace_unmapped_products`, supaya Total Sales/COS tidak
 * pernah setengah-valid.
 *
 * Idempoten: dedup utama lewat (source_type, source_order_id=sourceOrderKey).
 * Pesanan MANUAL yang match_fingerprint-nya sama (isi transaksi identik,
 * independen dari source) DIKONVERSI jadi official, bukan di-duplicate.
 */
export async function ingestWorkspaceOrdersFromImport(
  client: TransactionClient,
  orders: NormalizedDailyOrder[],
  batchId: number
): Promise<WorkspaceImportSummary> {
  const summary: WorkspaceImportSummary = {
    ordersIngested: 0,
    ordersConvertedFromManual: 0,
    ordersSkippedUnmappedProduct: 0,
    ordersSkippedNegativeTotal: 0,
    ordersHeldAdjustedStatus: 0,
    unmappedProductNames: 0,
  };

  const cutoverDate = await loadActiveCutoverDate(client);
  if (!cutoverDate) return summary;

  const qualifying = orders.filter((order) => order.crmClassification.included && order.orderDate >= cutoverDate);
  if (!qualifying.length) return summary;

  const productLookup = await loadProductLookup(client);
  const unmappedSeen = new Set<string>();

  for (const order of qualifying) {
    // ADJUSTED wajib ditahan SEBELUM resolusi produk — tidak ada nilai delta
    // yang bisa dipercaya untuk dihitung, jadi order ini tidak pernah boleh
    // masuk workspace_orders sama sekali (docs prompt perbaikan §5).
    const statusMapping = mapImportStatusToWorkspace(order.transactionStatus);
    if (statusMapping.action === "HOLD") {
      summary.ordersHeldAdjustedStatus += 1;
      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value, reason)
         VALUES (NULL, 'ORDER_IMPORT_HELD', 'WORKSPACE_IMPORT_HOLD', $1, jsonb_build_object('orderDate',$2::text,'customerName',$3::text,'normalizedPhone',$4::text,'sourceStatus',$5::text), $6)`,
        [order.sourceOrderKey, order.orderDate, order.customerName, order.normalizedPhone, order.transactionStatus, statusMapping.reason]
      );
      continue;
    }
    const status = statusMapping.status;

    const resolvedItems: { productId: number; productIdText: string; productName: string; itemType: "SALE" | "BONUS"; quantity: bigint; sellingPrice: bigint; unitHpp: bigint }[] = [];
    let hasUnmapped = false;
    for (const item of order.items) {
      const product = productLookup.get(normalizeProductAlias(item.rawProductName));
      if (!product) {
        hasUnmapped = true;
        const normalized = normalizeProductAlias(item.rawProductName);
        if (!unmappedSeen.has(normalized)) {
          unmappedSeen.add(normalized);
          summary.unmappedProductNames += 1;
        }
        await recordUnmappedProduct(client, item.rawProductName, batchId, {
          sourceOrderId: order.sourceOrderKey,
          customerName: order.customerName,
          orderDate: order.orderDate,
          rawPayload: { rawProductName: item.rawProductName, qty: item.qty, amount: item.amount.toString(), sourceRowNumber: item.sourceRowNumber },
        });
        continue;
      }
      const itemType: "SALE" | "BONUS" = item.isBonus ? "BONUS" : "SALE";
      const quantity = item.qty && /^\d+$/.test(item.qty.trim()) ? BigInt(item.qty.trim()) : 1n;
      resolvedItems.push({
        productId: product.id,
        productIdText: product.productId,
        productName: product.productName,
        itemType,
        quantity,
        sellingPrice: itemType === "SALE" ? (product.sellingPrice ?? 0n) : 0n,
        unitHpp: product.unitHpp,
      });
    }
    if (hasUnmapped) {
      summary.ordersSkippedUnmappedProduct += 1;
      continue;
    }
    if (!resolvedItems.length) continue;

    const totalSalesValue = resolvedItems.reduce((sum, item) => sum + (item.itemType === "SALE" ? item.quantity * item.sellingPrice : 0n), 0n);
    const orderTotal = totalSalesValue + order.shippingCost + order.packingCost + order.adminCod - order.discount;
    if (orderTotal < 0n) {
      summary.ordersSkippedNegativeTotal += 1;
      continue;
    }
    const paymentMethod = normalizePaymentMethod(order.paymentMethod);
    const codValue = paymentMethod === "COD" ? orderTotal : 0n;

    const customerRow = await client.query<{ id: number }>("SELECT id FROM customers WHERE normalized_phone = $1", [order.normalizedPhone]);
    const customerId = customerRow.rows[0]?.id ?? null;

    const identityFingerprint = createOrderFingerprint({
      source: "DATABASE_ALL",
      orderDate: order.orderDate,
      normalizedPhone: order.normalizedPhone,
      customerName: order.customerName,
      csName: order.csName,
      total: orderTotal,
      items: resolvedItems.map((item) => ({ product: item.productIdText, qty: item.quantity.toString(), amount: item.itemType === "SALE" ? item.sellingPrice : 0n })),
    });
    const matchFingerprint = createOrderFingerprint({
      source: "WORKSPACE_MATCH",
      orderDate: order.orderDate,
      normalizedPhone: order.normalizedPhone,
      customerName: order.customerName,
      csName: order.csName,
      total: orderTotal,
      items: resolvedItems.map((item) => ({ product: item.productIdText, qty: item.quantity.toString(), amount: item.itemType === "SALE" ? item.sellingPrice : 0n })),
    });

    const existingOfficial = await client.query<{ id: number }>(
      "SELECT id FROM workspace_orders WHERE source_type = 'DATABASE_ALL' AND source_order_id = $1",
      [order.sourceOrderKey]
    );

    let orderId: number;
    if (existingOfficial.rows[0]) {
      orderId = existingOfficial.rows[0].id;
      await client.query(
        `UPDATE workspace_orders SET order_date=$2, customer_name=$3, normalized_phone=$4, phone_display=$5,
           city=$6, hub=$7, payment_method=$8::workspace_payment_method, memo=$9, partner=$10, crm_name_snapshot=$11,
           sales_type=$12, shipping_charge=$13, packing_charge=$14, discount=$15, cod_admin=$16, crm_voucher=0,
           total_sales_value=$17, order_total=$18, cod_value=$19, status=$20::workspace_order_status,
           deterministic_fingerprint=$21, match_fingerprint=$22, import_batch_id=$23, customer_id=$24, updated_at=now()
         WHERE id=$1`,
        [orderId, order.orderDate, order.customerName, order.normalizedPhone, order.displayPhone, order.city || null, order.hub || null, paymentMethod, order.memo || null, order.partner || null, order.csName || "—", order.salesType || null, order.shippingCost, order.packingCost, order.discount, order.adminCod, totalSalesValue, orderTotal, codValue, status, identityFingerprint, matchFingerprint, batchId, customerId]
      );
      await client.query("DELETE FROM workspace_order_items WHERE order_id = $1", [orderId]);
    } else {
      // `deleted_at IS NULL`: pesanan manual yang sudah di-soft-delete (fitur
      // Hapus Pesanan) tidak boleh "dihidupkan lagi" dengan menempelkan data
      // import official di atasnya — baris itu tetap tersembunyi (deleted_at
      // tidak disentuh UPDATE di bawah), sehingga import official yang sah
      // ikut hilang. Kalau match-nya sudah dihapus, jatuh ke cabang INSERT
      // (buat baris DATABASE_ALL baru) alih-alih menimpa baris terhapus.
      const manualMatch = await client.query<{ id: number; status: string }>(
        "SELECT id, status FROM workspace_orders WHERE source_type = 'MANUAL' AND match_fingerprint = $1 AND status <> 'CANCELLED' AND deleted_at IS NULL LIMIT 1",
        [matchFingerprint]
      );
      if (manualMatch.rows[0]) {
        orderId = manualMatch.rows[0].id;
        summary.ordersConvertedFromManual += 1;
        const before = await client.query<Record<string, unknown>>("SELECT source_type, status FROM workspace_orders WHERE id = $1", [orderId]);
        await client.query(
          `UPDATE workspace_orders SET source_type='DATABASE_ALL', source_order_id=$2, order_date=$3, customer_name=$4,
             normalized_phone=$5, phone_display=$6, city=$7, hub=$8, payment_method=$9::workspace_payment_method, memo=$10,
             partner=$11, crm_name_snapshot=$12, sales_type=$13, shipping_charge=$14, packing_charge=$15, discount=$16,
             cod_admin=$17, crm_voucher=0, total_sales_value=$18, order_total=$19, cod_value=$20,
             status=$21::workspace_order_status, deterministic_fingerprint=$22, match_fingerprint=$23,
             import_batch_id=$24, customer_id=$25, updated_at=now()
           WHERE id=$1`,
          [orderId, order.sourceOrderKey, order.orderDate, order.customerName, order.normalizedPhone, order.displayPhone, order.city || null, order.hub || null, paymentMethod, order.memo || null, order.partner || null, order.csName || "—", order.salesType || null, order.shippingCost, order.packingCost, order.discount, order.adminCod, totalSalesValue, orderTotal, codValue, status, identityFingerprint, matchFingerprint, batchId, customerId]
        );
        await client.query("DELETE FROM workspace_order_items WHERE order_id = $1", [orderId]);
        await client.query(
          `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
           VALUES (NULL, 'ORDER_MANUAL_TO_OFFICIAL', 'WORKSPACE_ORDER', $1, $2::jsonb, jsonb_build_object('sourceType','DATABASE_ALL','sourceOrderId',$3::text), 'Cocok dengan hasil import Database All — official menjadi sumber utama')`,
          [String(orderId), JSON.stringify(before.rows[0] ?? {}), order.sourceOrderKey]
        );
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO workspace_orders (
             order_number, source_type, source_order_id, deterministic_fingerprint, match_fingerprint, import_batch_id,
             order_date, customer_name, normalized_phone, phone_display, city, hub, payment_method, memo, partner,
             crm_name_snapshot, sales_type, shipping_charge, packing_charge, discount, cod_admin, crm_voucher,
             total_sales_value, order_total, cod_value, status, customer_id
           ) VALUES (
             'PENDING', 'DATABASE_ALL', $1, $2, $3, $4,
             $5, $6, $7, $8, $9, $10, $11::workspace_payment_method, $12, $13,
             $14, $15, $16, $17, $18, $19, 0,
             $20, $21, $22, $23::workspace_order_status, $24
           ) RETURNING id`,
          [order.sourceOrderKey, identityFingerprint, matchFingerprint, batchId, order.orderDate, order.customerName, order.normalizedPhone, order.displayPhone, order.city || null, order.hub || null, paymentMethod, order.memo || null, order.partner || null, order.csName || "—", order.salesType || null, order.shippingCost, order.packingCost, order.discount, order.adminCod, totalSalesValue, orderTotal, codValue, status, customerId]
        );
        orderId = inserted.rows[0]!.id;
        await client.query("UPDATE workspace_orders SET order_number = 'PSN-' || lpad($2::text, 6, '0') WHERE id = $1", [orderId, orderId]);
      }
    }

    let lineNo = 1;
    for (const item of resolvedItems) {
      const totalSales = item.itemType === "SALE" ? item.quantity * item.sellingPrice : 0n;
      const totalHpp = item.quantity * item.unitHpp;
      await client.query(
        `INSERT INTO workspace_order_items (order_id, line_no, product_id, product_name_snapshot, item_type, quantity, selling_price_snapshot, unit_hpp_snapshot, total_sales_value, total_hpp)
         VALUES ($1, $2, $3, $4, $5::workspace_item_type, $6, $7, $8, $9, $10)`,
        [orderId, lineNo, item.productId, item.productName, item.itemType, item.quantity.toString(), item.sellingPrice, item.unitHpp, totalSales, totalHpp]
      );
      lineNo += 1;
    }
    summary.ordersIngested += 1;
  }

  return summary;
}
