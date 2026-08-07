import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { createWorkspaceProductAliasWithin } from "@/server/workspace/products";
import { retryOrdersForResolvedProduct, type UnmappedRetryResult } from "@/server/workspace/unmapped-retry";

export class UnmappedProductNotFoundError extends Error {}
export class UnmappedProductAlreadyResolvedError extends Error {}
export class UnmappedProductNotResolvedError extends Error {}

export type WorkspaceUnmappedProductRow = {
  id: number;
  source: string;
  rawProductName: string;
  normalizedName: string;
  sampleSourceOrderId: string | null;
  sampleCustomerName: string | null;
  sampleOrderDate: string | null;
  status: "PENDING" | "RESOLVED" | "IGNORED";
  mappedProductId: number | null;
  mappedProductName: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Baris mentah contoh dari import — dipakai tombol "Lihat Raw Data". */
  rawPayload: Record<string, unknown> | null;
};

export async function listUnmappedProducts(status?: "PENDING" | "RESOLVED" | "IGNORED"): Promise<WorkspaceUnmappedProductRow[]> {
  const where = status ? sql`WHERE u.status = ${status}::workspace_unmapped_product_status` : sql``;
  const result = await getDb().execute<{
    id: number;
    source: string;
    raw_product_name: string;
    normalized_name: string;
    sample_source_order_id: string | null;
    sample_customer_name: string | null;
    sample_order_date: string | null;
    status: WorkspaceUnmappedProductRow["status"];
    mapped_product_id: number | null;
    mapped_product_name: string | null;
    resolved_by_name: string | null;
    resolved_at: string | null;
    occurrence_count: number;
    first_seen_at: string;
    last_seen_at: string;
    raw_payload: Record<string, unknown> | null;
  }>(sql`
    SELECT u.id::int AS id, u.source, u.raw_product_name, u.normalized_name, u.sample_source_order_id,
      u.sample_customer_name, u.sample_order_date::text AS sample_order_date, u.status::text AS status,
      u.mapped_product_id, p.product_name AS mapped_product_name, resolver.name AS resolved_by_name,
      u.resolved_at::text AS resolved_at, u.occurrence_count, u.first_seen_at::text AS first_seen_at,
      u.last_seen_at::text AS last_seen_at, u.raw_payload
    FROM workspace_unmapped_products u
    LEFT JOIN workspace_products p ON p.id = u.mapped_product_id
    LEFT JOIN users resolver ON resolver.id = u.resolved_by
    ${where}
    ORDER BY (u.status = 'PENDING') DESC, u.last_seen_at DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    source: row.source,
    rawProductName: row.raw_product_name,
    normalizedName: row.normalized_name,
    sampleSourceOrderId: row.sample_source_order_id,
    sampleCustomerName: row.sample_customer_name,
    sampleOrderDate: row.sample_order_date,
    status: row.status,
    mappedProductId: row.mapped_product_id,
    mappedProductName: row.mapped_product_name,
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    rawPayload: row.raw_payload,
  }));
}

/**
 * Resolusi: buat/aktifkan alias Master Data untuk nama mentah ini, tandai baris
 * RESOLVED, LALU replay order kanonik yang sebelumnya dilewati karena nama ini
 * (docs prompt §K). Admin tidak perlu mengunggah ulang Database All.
 *
 * Semuanya dalam SATU transaksi: kalau replay gagal, alias dan status RESOLVED
 * ikut rollback — tidak ada state setengah jadi yang membuat produk terlihat
 * sudah beres padahal ordernya tidak pernah masuk.
 *
 * Idempoten: baris di-`FOR UPDATE` (klik ganda serentak antre, yang kedua
 * melihat status RESOLVED dan ditolak), dan replay sendiri dedup lewat
 * (source_type, source_order_id) + match_fingerprint.
 */
export async function resolveUnmappedProduct(
  id: number,
  mappedProductInternalId: number,
  actorId: number
): Promise<UnmappedRetryResult> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: number; status: string; raw_product_name: string; normalized_name: string }>(
      "SELECT id, status, raw_product_name, normalized_name FROM workspace_unmapped_products WHERE id = $1 FOR UPDATE",
      [id]
    );
    const row = existing.rows[0];
    if (!row) throw new UnmappedProductNotFoundError();
    if (row.status === "RESOLVED") throw new UnmappedProductAlreadyResolvedError();

    await createWorkspaceProductAliasWithin(client, mappedProductInternalId, row.raw_product_name, actorId);

    await client.query(
      `UPDATE workspace_unmapped_products
       SET status = 'RESOLVED', mapped_product_id = $2, resolved_by = $3, resolved_at = now()
       WHERE id = $1`,
      [id, mappedProductInternalId, actorId]
    );

    const retry = await retryOrdersForResolvedProduct(client, row.normalized_name, row.raw_product_name);

    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'UNMAPPED_PRODUCT_RESOLVE', 'WORKSPACE_UNMAPPED_PRODUCT', $2, $3::jsonb)`,
      [
        actorId,
        String(id),
        JSON.stringify({
          mappedProductId: mappedProductInternalId,
          rawProductName: row.raw_product_name,
          retry,
        }),
      ]
    );
    return retry;
  });
}

/**
 * Retry ulang tanpa mengubah mapping — untuk baris yang sudah RESOLVED tapi
 * ordernya dulu masih tertahan produk lain yang kini ikut beres.
 */
export async function retryUnmappedProduct(id: number, actorId: number): Promise<UnmappedRetryResult> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: number; status: string; raw_product_name: string; normalized_name: string }>(
      "SELECT id, status, raw_product_name, normalized_name FROM workspace_unmapped_products WHERE id = $1 FOR UPDATE",
      [id]
    );
    const row = existing.rows[0];
    if (!row) throw new UnmappedProductNotFoundError();
    if (row.status !== "RESOLVED") {
      throw new UnmappedProductNotResolvedError("Petakan produk ini ke Master Produk terlebih dahulu sebelum retry");
    }

    const retry = await retryOrdersForResolvedProduct(client, row.normalized_name, row.raw_product_name);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'UNMAPPED_PRODUCT_RETRY', 'WORKSPACE_UNMAPPED_PRODUCT', $2, $3::jsonb)`,
      [actorId, String(id), JSON.stringify(retry)]
    );
    return retry;
  });
}

export async function ignoreUnmappedProduct(id: number, actorId: number, reason: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: number; status: string }>("SELECT id, status FROM workspace_unmapped_products WHERE id = $1 FOR UPDATE", [id]);
    const row = existing.rows[0];
    if (!row) throw new UnmappedProductNotFoundError();
    if (row.status === "RESOLVED") throw new UnmappedProductAlreadyResolvedError();

    await client.query(
      `UPDATE workspace_unmapped_products SET status = 'IGNORED', resolved_by = $2, resolved_at = now() WHERE id = $1`,
      [id, actorId]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, reason)
       VALUES ($1, 'UNMAPPED_PRODUCT_IGNORE', 'WORKSPACE_UNMAPPED_PRODUCT', $2, $3)`,
      [actorId, String(id), reason]
    );
  });
}
