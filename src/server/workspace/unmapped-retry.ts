import type { TransactionClient } from "@/server/db/transaction";

export type UnmappedRetryResult = {
  /** Nama mentah yang barusan diselesaikan. */
  rawProductName: string;
  /** Order kanonik (legacy/Analysis) yang memuat nama mentah ini dan memenuhi syarat CRM. */
  candidateOrders: number;
  /** SELALU 0 sejak batas domain ditegakkan — retry tidak pernah membuat order Workspace. */
  ordersIngested: number;
  /** SELALU 0 — konversi MANUAL→official adalah jalur import Workspace yang sudah dicabut. */
  ordersConvertedFromManual: number;
  /** Masih tertahan karena SATU order bisa memuat produk tak dikenal LAIN. */
  ordersStillBlocked: number;
  ordersHeldAdjustedStatus: number;
  ordersSkippedNegativeTotal: number;
  /** Nama mentah lain yang masih menghalangi order di atas — ditampilkan ke admin. */
  blockingProductNames: string[];
};

/**
 * Ringkasan dampak resolusi produk tak dikenal terhadap order kanonik
 * (`orders`/`order_items` — domain legacy/Analysis).
 *
 * BATAS DOMAIN: fungsi ini TIDAK menulis `workspace_orders`/`workspace_order_items`.
 * Sebelumnya ia mereplay order kanonik ke `ingestWorkspaceOrdersFromImport`,
 * sehingga baris berprovenance `DATABASE_ALL` bocor ke Workspace Pesanan lewat
 * pintu belakang (bukan cuma lewat commit import). Jalur itu dicabut: Database
 * All adalah domain Analysis, Workspace Pesanan hanya menerima order
 * `source_type = 'MANUAL'` dari form Input Pesanan — lihat
 * src/server/workspace/provenance.ts.
 *
 * Yang TETAP berjalan: alias Master Data dibuat/diaktifkan dan baris
 * `workspace_unmapped_products` ditandai RESOLVED oleh pemanggil
 * (data-quality.ts), lalu fungsi ini melaporkan berapa order kanonik yang
 * terdampak dan nama mentah lain yang masih PENDING pada order yang sama.
 *
 * Idempoten secara trivial: murni baca, tidak ada tulis sama sekali.
 */
export async function retryOrdersForResolvedProduct(
  client: TransactionClient,
  normalizedName: string,
  rawProductName: string
): Promise<UnmappedRetryResult> {
  const orderIds = await loadCanonicalOrderIdsContaining(client, normalizedName);

  const result: UnmappedRetryResult = {
    rawProductName,
    candidateOrders: orderIds.length,
    ordersIngested: 0,
    ordersConvertedFromManual: 0,
    ordersStillBlocked: 0,
    ordersHeldAdjustedStatus: 0,
    ordersSkippedNegativeTotal: 0,
    blockingProductNames: [],
  };
  if (!orderIds.length) return result;

  // Order yang masih memuat produk tak dikenal LAIN dilaporkan apa adanya ke
  // admin — tetap dihitung "tertahan", bukan dianggap beres.
  const [ordersStillBlocked, blockingProductNames] = await Promise.all([
    countOrdersStillBlocked(client, orderIds),
    loadStillBlockingNames(client, normalizedName),
  ]);
  return { ...result, ordersStillBlocked, blockingProductNames };
}

/** Berapa dari order kandidat yang MASIH memuat nama mentah berstatus PENDING. */
async function countOrdersStillBlocked(client: TransactionClient, orderIds: number[]): Promise<number> {
  const result = await client.query<{ blocked: string }>(
    `SELECT COUNT(DISTINCT i.order_id)::text AS blocked
     FROM order_items i
     JOIN workspace_unmapped_products u
       ON u.normalized_name = upper(btrim(regexp_replace(i.raw_product_name, '\\s+', ' ', 'g')))
      AND u.status = 'PENDING'
     WHERE i.order_id = ANY($1::bigint[])`,
    [orderIds]
  );
  return Number(result.rows[0]?.blocked ?? 0);
}

/**
 * Order kanonik CRM (domain legacy/Analysis) yang salah satu itemnya memakai
 * nama mentah ini. Cukup id-nya: sejak batas domain ditegakkan tidak ada lagi
 * order yang perlu direhidrasi jadi NormalizedDailyOrder untuk ditulis ulang ke
 * Workspace — angka ini murni laporan dampak untuk admin.
 */
async function loadCanonicalOrderIdsContaining(client: TransactionClient, normalizedName: string): Promise<number[]> {
  const result = await client.query<{ id: number }>(
    `SELECT o.id
     FROM orders o
     WHERE o.is_crm_transaction = true
       AND EXISTS (
         SELECT 1 FROM order_items i
         WHERE i.order_id = o.id AND upper(btrim(regexp_replace(i.raw_product_name, '\\s+', ' ', 'g'))) = $1
       )
     ORDER BY o.order_date`,
    [normalizedName]
  );
  return result.rows.map((row) => row.id);
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
