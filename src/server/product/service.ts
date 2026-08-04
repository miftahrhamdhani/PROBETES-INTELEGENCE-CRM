/**
 * BACKEND — Product Mapping (FR-25).
 *
 * Aturan yang dijaga di sini:
 *  - TIDAK ADA mapping otomatis diam-diam (CLAUDE.md #10). Nama produk baru tetap
 *    UNKNOWN sampai admin menyetujui secara eksplisit lewat approveProductMapping.
 *  - Approval BUKAN hanya mencatat alias: item canonical yang sudah terlanjur
 *    UNKNOWN ikut di-remap, lalu cluster dihitung ulang HANYA untuk customer
 *    terdampak (bukan rebuild seluruh populasi).
 *  - Aturan cluster A1–F tidak disentuh. Yang berubah cuma product_id item, dan
 *    cluster dievaluasi ulang dengan engine murni yang sama.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { canonicalizeForMatching } from "@/server/normalize/product-catalog";
import { recalculateClusterForCustomer } from "@/server/import/orchestrator";
import type {
  ApprovedAliasRow,
  CanonicalProductOption,
  MappingImpactPreview,
  UnknownProductFilter,
  UnknownProductResult,
} from "@/lib/product-mapping-types";

export async function listCanonicalProducts(): Promise<CanonicalProductOption[]> {
  const result = await getDb().execute<{ id: number; code: string; name: string; category: string }>(sql`
    SELECT id, code, name, category::text AS category
    FROM products
    WHERE active = true AND code <> 'UNKNOWN'
    ORDER BY name
  `);
  return result.rows;
}

/**
 * Nama produk mentah yang saat ini terpetakan ke UNKNOWN, dikelompokkan.
 * Sumbernya `order_items` canonical (bukan staging), jadi angkanya sama dengan
 * yang benar-benar memengaruhi cluster.
 */
export async function listUnknownProducts(filter: UnknownProductFilter): Promise<UnknownProductResult> {
  const db = getDb();
  const perPage = Math.min(Math.max(filter.perPage ?? 25, 1), 200);
  const page = Math.max(filter.page ?? 1, 1);
  const offset = (page - 1) * perPage;
  const search = filter.search?.trim();
  const searchCondition = search ? sql`AND oi.raw_product_name ILIKE ${"%" + search + "%"}` : sql``;

  const [rows, totals, summary] = await Promise.all([
    db.execute<{
      raw_product_name: string;
      item_count: string;
      customer_count: string;
      needs_review_count: string;
      total_amount: string;
      first_seen: string | null;
      last_seen: string | null;
    }>(sql`
      SELECT
        oi.raw_product_name,
        COUNT(*)::text AS item_count,
        COUNT(DISTINCT o.customer_id)::text AS customer_count,
        COUNT(DISTINCT o.customer_id) FILTER (WHERE cc.cluster_code = 'NEEDS_REVIEW')::text AS needs_review_count,
        COALESCE(SUM(oi.amount), 0)::text AS total_amount,
        MIN(o.order_date)::text AS first_seen,
        MAX(o.order_date)::text AS last_seen
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = o.customer_id
      WHERE p.code = 'UNKNOWN' ${searchCondition}
      GROUP BY oi.raw_product_name
      ORDER BY COUNT(*) DESC, oi.raw_product_name
      LIMIT ${perPage} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT oi.raw_product_name)::text AS total
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE p.code = 'UNKNOWN' ${searchCondition}
    `),
    db.execute<{ items: string; needs_review: string }>(sql`
      SELECT
        (SELECT COUNT(*) FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE p.code = 'UNKNOWN')::text AS items,
        (SELECT COUNT(*) FROM customer_cluster_current WHERE cluster_code = 'NEEDS_REVIEW')::text AS needs_review
    `),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      rawProductName: row.raw_product_name,
      normalizedName: canonicalizeForMatching(row.raw_product_name),
      itemCount: Number(row.item_count),
      customerCount: Number(row.customer_count),
      needsReviewCount: Number(row.needs_review_count),
      totalAmount: row.total_amount,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    })),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
    totalUnknownItems: Number(summary.rows[0]?.items ?? 0),
    totalNeedsReviewCustomers: Number(summary.rows[0]?.needs_review ?? 0),
  };
}

export async function listApprovedAliases(): Promise<ApprovedAliasRow[]> {
  const result = await getDb().execute<{
    id: number;
    raw_name: string;
    normalized_name: string;
    code: string;
    name: string;
    approved_at: string | null;
    approved_by: string | null;
  }>(sql`
    SELECT a.id, a.raw_name, a.normalized_name, p.code, p.name,
           a.approved_at::text, u.name AS approved_by
    FROM product_aliases a
    JOIN products p ON p.id = a.product_id
    LEFT JOIN users u ON u.id = a.approved_by
    WHERE a.approved_at IS NOT NULL
    ORDER BY a.approved_at DESC NULLS LAST, a.id DESC
    LIMIT 200
  `);
  return result.rows.map((row) => ({
    id: row.id,
    rawName: row.raw_name,
    normalizedName: row.normalized_name,
    productCode: row.code,
    productName: row.name,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
  }));
}

/**
 * Dampak SEBELUM disetujui. Semua nama mentah yang canonical-nya sama ikut
 * terhitung (mis. "Produk X" dan "S Produk X BONUS") — itu memang yang akan
 * ikut ter-remap, jadi admin melihat angka yang sebenarnya.
 */
export async function previewMappingImpact(
  rawProductName: string,
  productId: number
): Promise<MappingImpactPreview | null> {
  const normalized = canonicalizeForMatching(rawProductName);
  if (!normalized) return null;

  const db = getDb();
  const [target, impact] = await Promise.all([
    db.execute<{ code: string; name: string }>(sql`
      SELECT code, name FROM products WHERE id = ${productId} AND active = true AND code <> 'UNKNOWN'
    `),
    db.execute<{
      item_count: string;
      customer_count: string;
      needs_review_before: string;
      fully_resolved: string;
    }>(sql`
      WITH affected_items AS (
        SELECT oi.id, o.customer_id
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.code = 'UNKNOWN' AND ${normalizedMatch(normalized)}
      ),
      affected_customers AS (
        SELECT DISTINCT customer_id FROM affected_items
      )
      SELECT
        (SELECT COUNT(*) FROM affected_items)::text AS item_count,
        (SELECT COUNT(*) FROM affected_customers)::text AS customer_count,
        (SELECT COUNT(*) FROM affected_customers ac
           JOIN customer_cluster_current cc ON cc.customer_id = ac.customer_id
          WHERE cc.cluster_code = 'NEEDS_REVIEW')::text AS needs_review_before,
        (SELECT COUNT(*) FROM affected_customers ac
          WHERE NOT EXISTS (
            SELECT 1
            FROM order_items oi2
            JOIN products p2 ON p2.id = oi2.product_id
            JOIN orders o2 ON o2.id = oi2.order_id
            WHERE o2.customer_id = ac.customer_id
              AND p2.code = 'UNKNOWN'
              AND NOT (${normalizedMatch(normalized, "oi2")})
          ))::text AS fully_resolved
    `),
  ]);

  const product = target.rows[0];
  if (!product) return null;
  const row = impact.rows[0];

  return {
    normalizedName: normalized,
    targetProductCode: product.code,
    targetProductName: product.name,
    itemCount: Number(row?.item_count ?? 0),
    customerCount: Number(row?.customer_count ?? 0),
    needsReviewBefore: Number(row?.needs_review_before ?? 0),
    customersFullyResolved: Number(row?.fully_resolved ?? 0),
  };
}

/**
 * Pencocokan nama mentah -> bentuk canonical, ditulis sebagai SQL yang meniru
 * canonicalizeForMatching(): upper, buang prefix "S "/"TK ", buang suffix " BONUS",
 * rapatkan spasi. Dipakai supaya remap menangkap seluruh varian penulisan yang
 * memang akan diklasifikasikan sama oleh parser.
 */
function normalizedMatch(normalized: string, alias = "oi") {
  const column = sql.raw(`${alias}.raw_product_name`);
  return sql`
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(upper(btrim(${column})), '\\s+', ' ', 'g'),
          '^(S|TK) ', ''
        ),
        ' BONUS$', ''
      )
    ) = ${normalized}
  `;
}

/**
 * Approve mapping: catat alias, remap item canonical, lalu hitung ulang cluster
 * HANYA untuk customer terdampak. Satu transaction — kalau ada yang gagal,
 * tidak ada perubahan separuh jalan.
 */
export async function approveProductMapping(input: {
  rawProductName: string;
  productId: number;
  userId: number;
}): Promise<{ itemsRemapped: number; customersRecalculated: number; clusterChanges: number }> {
  const normalized = canonicalizeForMatching(input.rawProductName);
  if (!normalized) throw new Error("Nama produk kosong");

  return withTransaction(async (client) => {
    const product = await client.query<{ id: number; code: string }>(
      "SELECT id, code FROM products WHERE id = $1 AND active = true AND code <> 'UNKNOWN'",
      [input.productId]
    );
    if (!product.rows[0]) throw new Error("Produk canonical tidak valid sebagai target mapping");

    // 1. Alias — idempoten: approve ulang nama yang sama hanya memperbarui target.
    await client.query(
      `INSERT INTO product_aliases (raw_name, normalized_name, product_id, approved_at, approved_by)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (normalized_name) DO UPDATE SET
         raw_name = EXCLUDED.raw_name,
         product_id = EXCLUDED.product_id,
         approved_at = now(),
         approved_by = EXCLUDED.approved_by`,
      [input.rawProductName.trim(), normalized, input.productId, input.userId]
    );

    // 2. Customer terdampak dicatat DULU (setelah remap, item-nya bukan UNKNOWN lagi).
    const affected = await client.query<{ customer_id: number }>(
      `SELECT DISTINCT o.customer_id
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE p.code = 'UNKNOWN'
         AND btrim(regexp_replace(regexp_replace(regexp_replace(upper(btrim(oi.raw_product_name)), '\\s+', ' ', 'g'), '^(S|TK) ', ''), ' BONUS$', '')) = $1`,
      [normalized]
    );

    // 3. Remap item canonical.
    const remapped = await client.query(
      `UPDATE order_items oi
       SET product_id = $2
       FROM products p
       WHERE p.id = oi.product_id AND p.code = 'UNKNOWN'
         AND btrim(regexp_replace(regexp_replace(regexp_replace(upper(btrim(oi.raw_product_name)), '\\s+', ' ', 'g'), '^(S|TK) ', ''), ' BONUS$', '')) = $1`,
      [normalized, input.productId]
    );

    // 4. Rekalkulasi cluster hanya untuk customer terdampak, memakai engine murni
    //    yang sama dengan rebuildClusters (tidak ada duplikasi aturan).
    let clusterChanges = 0;
    for (const row of affected.rows) {
      const before = await client.query<{ cluster_code: string }>(
        "SELECT cluster_code FROM customer_cluster_current WHERE customer_id = $1",
        [row.customer_id]
      );
      const result = await recalculateClusterForCustomer(client, row.customer_id);
      if (result && before.rows[0]?.cluster_code !== result.clusterCode) clusterChanges++;
    }

    return {
      itemsRemapped: remapped.rowCount ?? 0,
      customersRecalculated: affected.rows.length,
      clusterChanges,
    };
  });
}
