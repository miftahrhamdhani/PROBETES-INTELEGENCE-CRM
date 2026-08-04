/**
 * BACKEND — pembacaan alias produk yang sudah di-approve admin.
 *
 * File terpisah dari product/service.ts supaya tidak ada import melingkar:
 * orchestrator butuh overlay ini, sedangkan service.ts butuh
 * recalculateClusterForCustomer dari orchestrator.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { TransactionClient } from "@/server/db/transaction";
import type { CanonicalProductCode, ProductAliasOverlay } from "@/server/normalize/product-catalog";

const SELECT_APPROVED = `
  SELECT a.normalized_name, p.code
  FROM product_aliases a
  JOIN products p ON p.id = a.product_id
  WHERE a.approved_at IS NOT NULL AND p.active = true
`;

/** Dipakai jalur non-transaksional (mis. validate/preview import). */
export async function loadApprovedAliasOverlay(): Promise<ProductAliasOverlay> {
  const result = await getDb().execute<{ normalized_name: string; code: CanonicalProductCode }>(
    sql.raw(SELECT_APPROVED)
  );
  return new Map(result.rows.map((row) => [row.normalized_name, row.code]));
}

/** Dipakai di dalam transaction commit import — konsisten dengan snapshot yang sama. */
export async function loadApprovedAliasOverlayTx(
  client: TransactionClient
): Promise<ProductAliasOverlay> {
  const result = await client.query<{ normalized_name: string; code: CanonicalProductCode }>(
    SELECT_APPROVED
  );
  return new Map(result.rows.map((row) => [row.normalized_name, row.code]));
}
