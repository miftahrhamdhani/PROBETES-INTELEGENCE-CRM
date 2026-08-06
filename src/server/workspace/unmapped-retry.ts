import type { TransactionClient } from "@/server/db/transaction";
import { classifyProduct } from "@/server/normalize/product-catalog";
import { ingestWorkspaceOrdersFromImport } from "@/server/workspace/pesanan-import";
import type { NormalizedDailyOrder, NormalizedOrderItem } from "@/server/import/types";

export type UnmappedRetryResult = {
  /** Nama mentah yang barusan diselesaikan. */
  rawProductName: string;
  /** Order kanonik yang memuat nama mentah ini dan memenuhi syarat CRM. */
  candidateOrders: number;
  ordersIngested: number;
  ordersConvertedFromManual: number;
  /** Masih tertahan karena SATU order bisa memuat produk tak dikenal LAIN. */
  ordersStillBlocked: number;
  ordersHeldAdjustedStatus: number;
  ordersSkippedNegativeTotal: number;
  /** Nama mentah lain yang masih menghalangi order di atas — ditampilkan ke admin. */
  blockingProductNames: string[];
};

/**
 * Replay order kanonik yang sebelumnya dilewati karena produknya tak dikenal.
 *
 * Sumber replay adalah tabel kanonik `orders`/`order_items` (hasil import yang
 * SUDAH tersimpan), bukan file upload — jadi retry tidak menuntut admin
 * mengunggah ulang Database All. `workspace_unmapped_products.raw_payload`
 * sengaja tidak dipakai: isinya hanya SATU baris contoh per nama produk
 * (ON CONFLICT menimpanya), bukan seluruh order terdampak.
 *
 * Idempoten: seluruh pekerjaan didelegasikan ke ingestWorkspaceOrdersFromImport
 * yang dedup lewat (source_type, source_order_id) dan match_fingerprint, jadi
 * menekan tombol dua kali menghasilkan state yang sama — bukan order ganda.
 *
 * Order yang masih memuat produk tak dikenal LAIN tetap dilewati SELURUHNYA
 * (bukan sebagian), sesuai aturan "Total Sales/COS tidak pernah setengah-valid".
 */
export async function retryOrdersForResolvedProduct(
  client: TransactionClient,
  normalizedName: string,
  rawProductName: string
): Promise<UnmappedRetryResult> {
  const orders = await loadCanonicalOrdersContaining(client, normalizedName);

  const empty: UnmappedRetryResult = {
    rawProductName,
    candidateOrders: orders.length,
    ordersIngested: 0,
    ordersConvertedFromManual: 0,
    ordersStillBlocked: 0,
    ordersHeldAdjustedStatus: 0,
    ordersSkippedNegativeTotal: 0,
    blockingProductNames: [],
  };
  if (!orders.length) return empty;

  // batchId dipakai untuk kolom import_batch_id; ambil batch asal order pertama
  // supaya jejak asal-usulnya tetap menunjuk import yang benar.
  const batchId = orders[0]!.sourceBatchId;
  const summary = await ingestWorkspaceOrdersFromImport(
    client,
    orders.map((order) => order.normalized),
    batchId
  );

  return {
    ...empty,
    ordersIngested: summary.ordersIngested,
    ordersConvertedFromManual: summary.ordersConvertedFromManual,
    ordersStillBlocked: summary.ordersSkippedUnmappedProduct,
    ordersHeldAdjustedStatus: summary.ordersHeldAdjustedStatus,
    ordersSkippedNegativeTotal: summary.ordersSkippedNegativeTotal,
    blockingProductNames: await loadStillBlockingNames(client, normalizedName),
  };
}

type CanonicalOrder = { sourceBatchId: number; normalized: NormalizedDailyOrder };

/** Order kanonik CRM yang salah satu itemnya memakai nama mentah ini. */
async function loadCanonicalOrdersContaining(client: TransactionClient, normalizedName: string): Promise<CanonicalOrder[]> {
  const result = await client.query<{
    id: number;
    source_order_key: string;
    order_date: string;
    order_total: string;
    workspace_total: string;
    platform: string | null;
    division: string | null;
    payment_method: string | null;
    partner: string | null;
    memo: string | null;
    city: string | null;
    hub: string | null;
    sales_type: string | null;
    shipping_cost: string;
    packing_cost: string;
    discount: string;
    admin_cod: string;
    crm_marketing_cost: string;
    order_closing_count: number;
    transaction_status: NormalizedDailyOrder["transactionStatus"];
    is_crm_transaction: boolean;
    crm_inclusion_reason: string | null;
    source_batch_id: number;
    cs_name: string | null;
    normalized_phone: string;
    display_phone: string | null;
    customer_name: string | null;
  }>(
    `SELECT o.id, o.source_order_key, o.order_date::text, o.order_total::text, o.workspace_total::text,
       o.platform, o.division, o.payment_method, o.partner, o.memo, o.city, o.hub, o.sales_type,
       o.shipping_cost::text, o.packing_cost::text, o.discount::text, o.admin_cod::text,
       o.crm_marketing_cost::text, o.order_closing_count, o.transaction_status::text AS transaction_status,
       o.is_crm_transaction, o.crm_inclusion_reason, o.source_batch_id,
       cs.name AS cs_name, c.normalized_phone, c.display_phone, c.name AS customer_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN cs_agents cs ON cs.id = o.cs_id
     WHERE o.is_crm_transaction = true
       AND EXISTS (
         SELECT 1 FROM order_items i
         WHERE i.order_id = o.id AND upper(btrim(regexp_replace(i.raw_product_name, '\\s+', ' ', 'g'))) = $1
       )
     ORDER BY o.order_date`,
    [normalizedName]
  );
  if (!result.rows.length) return [];

  const orderIds = result.rows.map((row) => row.id);
  const itemsResult = await client.query<{
    order_id: number;
    source_item_key: string;
    source_row_number: number;
    external_id: string | null;
    raw_product_name: string;
    qty: string | null;
    amount: string;
    is_bonus: boolean;
    identity_confidence: "HIGH" | "LOW";
  }>(
    `SELECT order_id, source_item_key, source_row_number, external_id, raw_product_name,
            qty::text AS qty, amount::text AS amount, is_bonus, identity_confidence::text AS identity_confidence
     FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY order_id, source_row_number`,
    [orderIds]
  );

  const itemsByOrder = new Map<number, NormalizedOrderItem[]>();
  for (const item of itemsResult.rows) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      sourceItemKey: item.source_item_key,
      sourceRowNumber: item.source_row_number,
      externalId: item.external_id,
      rawProductName: item.raw_product_name,
      // Ingest workspace hanya membaca rawProductName/qty/amount/isBonus, tapi
      // flags tetap dihitung dengan classifier asli (bukan nilai karangan)
      // supaya bentuk NormalizedOrderItem di sini identik dengan yang dihasilkan
      // parser import.
      productFlags: classifyProduct(item.raw_product_name),
      qty: item.qty,
      amount: BigInt(item.amount),
      isBonus: item.is_bonus,
      identityConfidence: item.identity_confidence,
    });
    itemsByOrder.set(item.order_id, list);
  }

  return result.rows.map((row) => ({
    sourceBatchId: row.source_batch_id,
    normalized: {
      sourceOrderKey: row.source_order_key,
      normalizedPhone: row.normalized_phone,
      displayPhone: row.display_phone ?? row.normalized_phone,
      customerName: row.customer_name ?? "—",
      orderDate: row.order_date,
      orderTotal: BigInt(row.order_total),
      workspaceTotal: BigInt(row.workspace_total),
      platform: row.platform ?? "",
      division: row.division ?? "",
      paymentMethod: row.payment_method ?? "",
      partner: row.partner ?? "",
      csName: row.cs_name ?? "",
      memo: row.memo ?? "",
      city: row.city ?? "",
      hub: row.hub ?? "",
      salesType: row.sales_type ?? "",
      shippingCost: BigInt(row.shipping_cost),
      packingCost: BigInt(row.packing_cost),
      discount: BigInt(row.discount),
      adminCod: BigInt(row.admin_cod),
      crmMarketingCost: BigInt(row.crm_marketing_cost),
      orderClosingCount: row.order_closing_count,
      transactionStatus: row.transaction_status,
      crmClassification: {
        included: row.is_crm_transaction,
        inclusionReason: row.crm_inclusion_reason,
        exclusionReason: null,
      },
      items: itemsByOrder.get(row.id) ?? [],
    } as NormalizedDailyOrder,
  }));
}

/**
 * Nama mentah LAIN yang masih PENDING dan ikut muncul di order yang memuat
 * `normalizedName` — inilah alasan sebuah order tetap tertahan setelah retry.
 */
async function loadStillBlockingNames(client: TransactionClient, normalizedName: string): Promise<string[]> {
  const result = await client.query<{ raw_product_name: string }>(
    `SELECT DISTINCT other.raw_product_name
     FROM orders o
     JOIN order_items self ON self.order_id = o.id
       AND upper(btrim(regexp_replace(self.raw_product_name, '\\s+', ' ', 'g'))) = $1
     JOIN order_items other ON other.order_id = o.id
     JOIN workspace_unmapped_products u
       ON u.normalized_name = upper(btrim(regexp_replace(other.raw_product_name, '\\s+', ' ', 'g')))
      AND u.status = 'PENDING'
     WHERE o.is_crm_transaction = true
     LIMIT 20`,
    [normalizedName]
  );
  return result.rows.map((row) => row.raw_product_name);
}
