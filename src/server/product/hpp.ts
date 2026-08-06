import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";

export type ProductHppRow = {
  id: number;
  unitHpp: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listProductHppHistory(productId: number): Promise<ProductHppRow[]> {
  const result = await getDb().execute<{
    id: number;
    unit_hpp: string;
    effective_from: string;
    effective_to: string | null;
    created_by_name: string | null;
    created_at: string;
  }>(sql`
    SELECT h.id, h.unit_hpp::text, h.effective_from::text, h.effective_to::text,
      u.name AS created_by_name, h.created_at::text
    FROM product_hpp_history h
    LEFT JOIN users u ON u.id = h.created_by
    WHERE h.product_id = ${productId}
    ORDER BY h.effective_from DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    unitHpp: row.unit_hpp,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }));
}

/**
 * HPP baru selalu menutup interval open-ended sebelumnya (effective_to = tanggal
 * mulai baru), tidak pernah menimpa baris lama — snapshot order_items yang sudah
 * tersimpan tidak pernah berubah nilainya.
 */
export async function createProductHpp(
  input: { productId: number; unitHpp: bigint; effectiveFrom: string },
  actorUserId: number
): Promise<{ id: number }> {
  if (input.unitHpp < 0n) throw new RangeError("HPP tidak boleh negatif");
  return withTransaction(async (client) => {
    const open = await client.query<{ id: number; unit_hpp: string; effective_from: string }>(
      `SELECT id, unit_hpp::text, effective_from::text FROM product_hpp_history
       WHERE product_id = $1 AND effective_to IS NULL AND effective_from < $2::date
       ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`,
      [input.productId, input.effectiveFrom]
    );
    if (open.rows[0]) {
      await client.query("UPDATE product_hpp_history SET effective_to = $2::date WHERE id = $1", [
        open.rows[0].id,
        input.effectiveFrom,
      ]);
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO product_hpp_history (product_id, unit_hpp, effective_from, created_by)
       VALUES ($1, $2, $3::date, $4) RETURNING id`,
      [input.productId, input.unitHpp.toString(), input.effectiveFrom, actorUserId]
    );
    const newId = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'HPP_CREATE', 'PRODUCT_HPP', $2, $3::jsonb, jsonb_build_object('unitHpp', $4, 'effectiveFrom', $5))`,
      [
        actorUserId,
        String(newId),
        open.rows[0] ? JSON.stringify({ closedPreviousId: open.rows[0].id, previousUnitHpp: open.rows[0].unit_hpp }) : null,
        input.unitHpp.toString(),
        input.effectiveFrom,
      ]
    );
    return { id: newId };
  });
}
