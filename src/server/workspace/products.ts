import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import type { WorkspaceItemType } from "@/lib/workspace-pesanan-contracts";
import {
  type WorkspaceProductAliasRow,
  type WorkspaceProductBody,
  type WorkspaceProductFilter,
  type WorkspaceProductOption,
  type WorkspaceProductRow,
} from "@/lib/workspace-master-data-contracts";
import { allowedItemTypesForUsage } from "@/lib/workspace-product-seed";

export class WorkspaceProductNotFoundError extends Error {}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

export async function listWorkspaceProducts(filter: WorkspaceProductFilter): Promise<{ rows: WorkspaceProductRow[]; total: number }> {
  const conditions: SQL[] = [];
  if (!filter.includeInactive) conditions.push(sql`p.is_active = true`);
  if (filter.productUsage) conditions.push(sql`p.product_usage = ${filter.productUsage}::workspace_product_usage`);
  if (filter.search?.trim()) {
    const search = `%${filter.search.trim()}%`;
    conditions.push(sql`(p.product_name ILIKE ${search} OR p.product_id ILIKE ${search})`);
  }
  const where = conditions.length ? andAll(conditions) : sql`true`;
  const perPage = filter.perPage;
  const offset = (filter.page - 1) * perPage;
  const [result, countResult] = await Promise.all([
    getDb().execute<{
      id: number;
      product_id: string;
      product_name: string;
      selling_price: string | null;
      unit_hpp: string;
      product_usage: WorkspaceProductRow["productUsage"];
      description: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      created_by_name: string | null;
      updated_by_name: string | null;
      alias_count: string;
    }>(sql`
    SELECT p.id, p.product_id, p.product_name, p.selling_price::text, p.unit_hpp::text,
      p.product_usage::text AS product_usage, p.description, p.is_active,
      p.created_at::text, p.updated_at::text, creator.name AS created_by_name, updater.name AS updated_by_name,
      (SELECT COUNT(*) FROM workspace_product_aliases a WHERE a.product_id = p.id AND a.is_active = true)::text AS alias_count
    FROM workspace_products p
    LEFT JOIN users creator ON creator.id = p.created_by
    LEFT JOIN users updater ON updater.id = p.updated_by
    WHERE ${where}
    ORDER BY p.product_id
    LIMIT ${perPage} OFFSET ${offset}
  `),
    getDb().execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM workspace_products p WHERE ${where}`),
  ]);
  const rows = result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sellingPrice: row.selling_price,
    unitHpp: row.unit_hpp,
    productUsage: row.product_usage,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
    aliasCount: Number(row.alias_count),
  }));
  return { rows, total: Number(countResult.rows[0]?.total ?? 0) };
}

/** Produk aktif yang boleh dipilih untuk item_type tertentu — combobox Pesanan (§6.3.3). */
export async function listWorkspaceProductOptions(itemType?: WorkspaceItemType): Promise<WorkspaceProductOption[]> {
  const result = await getDb().execute<{
    id: number;
    product_id: string;
    product_name: string;
    selling_price: string | null;
    unit_hpp: string;
    product_usage: WorkspaceProductOption["productUsage"];
  }>(sql`
    SELECT id, product_id, product_name, selling_price::text, unit_hpp::text, product_usage::text AS product_usage
    FROM workspace_products WHERE is_active = true AND product_usage <> 'INACTIVE' ORDER BY product_name
  `);
  const rows = result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sellingPrice: row.selling_price,
    unitHpp: row.unit_hpp,
    productUsage: row.product_usage,
  }));
  if (!itemType) return rows;
  return rows.filter((row) => allowedItemTypesForUsage(row.productUsage).includes(itemType));
}

async function nextProductId(client: TransactionClient): Promise<string> {
  const result = await client.query<{ next_seq: number }>(
    `SELECT COALESCE(MAX(SUBSTRING(product_id FROM 5)::int), 0) + 1 AS next_seq
     FROM workspace_products WHERE product_id ~ '^PRD-[0-9]+$'`
  );
  const seq = result.rows[0]?.next_seq ?? 1;
  return `PRD-${String(seq).padStart(4, "0")}`;
}

export async function createWorkspaceProduct(body: WorkspaceProductBody, actorId: number): Promise<number> {
  return withTransaction(async (client) => {
    const productId = await nextProductId(client);
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO workspace_products (product_id, product_name, selling_price, unit_hpp, product_usage, description, is_active, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5::workspace_product_usage,$6,$7,$8,$8) RETURNING id`,
      [productId, body.productName, body.sellingPrice, body.unitHpp, body.productUsage, body.description ?? null, body.isActive, actorId]
    );
    const id = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'PRODUCT_CREATE', 'WORKSPACE_PRODUCT', $2, $3::jsonb)`,
      [actorId, String(id), JSON.stringify({ productId, ...body })]
    );
    return id;
  });
}

export async function updateWorkspaceProduct(id: number, body: WorkspaceProductBody, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query<Record<string, unknown>>(
      `SELECT product_id, product_name, selling_price, unit_hpp, product_usage, description, is_active FROM workspace_products WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!before.rows[0]) throw new WorkspaceProductNotFoundError();
    const result = await client.query(
      `UPDATE workspace_products SET product_name=$2, selling_price=$3, unit_hpp=$4, product_usage=$5::workspace_product_usage,
        description=$6, is_active=$7, updated_by=$8, updated_at=now() WHERE id=$1`,
      [id, body.productName, body.sellingPrice, body.unitHpp, body.productUsage, body.description ?? null, body.isActive, actorId]
    );
    if (result.rowCount === 0) throw new WorkspaceProductNotFoundError();
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'PRODUCT_UPDATE', 'WORKSPACE_PRODUCT', $2, $3::jsonb, $4::jsonb)`,
      [actorId, String(id), JSON.stringify(before.rows[0]), JSON.stringify(body)]
    );
  });
}

export async function deactivateWorkspaceProduct(id: number, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query<{ product_usage: string; is_active: boolean }>(
      `SELECT product_usage, is_active FROM workspace_products WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!before.rows[0]) throw new WorkspaceProductNotFoundError();
    await client.query(
      `UPDATE workspace_products SET product_usage='INACTIVE'::workspace_product_usage, is_active=false, updated_by=$2, updated_at=now() WHERE id=$1`,
      [id, actorId]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'PRODUCT_DEACTIVATE', 'WORKSPACE_PRODUCT', $2, $3::jsonb, jsonb_build_object('productUsage','INACTIVE','isActive',false))`,
      [actorId, String(id), JSON.stringify(before.rows[0])]
    );
  });
}

export async function listWorkspaceProductAliases(productInternalId: number): Promise<WorkspaceProductAliasRow[]> {
  const result = await getDb().execute<{
    id: number;
    product_id: number;
    source_system: string;
    alias_name: string;
    alias_normalized: string;
    is_active: boolean;
    created_at: string;
    created_by_name: string | null;
  }>(sql`
    SELECT a.id, a.product_id, a.source_system, a.alias_name, a.alias_normalized, a.is_active, a.created_at::text,
      creator.name AS created_by_name
    FROM workspace_product_aliases a LEFT JOIN users creator ON creator.id = a.created_by
    WHERE a.product_id = ${productInternalId} ORDER BY a.alias_name
  `);
  return result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    sourceSystem: row.source_system,
    aliasName: row.alias_name,
    aliasNormalized: row.alias_normalized,
    isActive: row.is_active,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }));
}

export function normalizeProductAlias(value: string): string {
  return value.trim().toLocaleUpperCase("id-ID").replace(/\s+/g, " ");
}

/**
 * Varian yang ikut menumpang transaksi pemanggil. Dipakai alur resolve+retry
 * produk tak dikenal (data-quality.ts) supaya pembuatan alias, penandaan
 * RESOLVED, dan replay order berada dalam SATU transaksi — kalau replay gagal,
 * aliasnya ikut rollback, bukan tertinggal sebagai state setengah jadi.
 */
export async function createWorkspaceProductAliasWithin(
  client: TransactionClient,
  productInternalId: number,
  aliasName: string,
  actorId: number
): Promise<number> {
  const normalized = normalizeProductAlias(aliasName);
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO workspace_product_aliases (product_id, source_system, alias_name, alias_normalized, is_active, created_by)
       VALUES ($1,'DATABASE_ALL',$2,$3,true,$4)
       ON CONFLICT (alias_normalized) DO UPDATE SET product_id = EXCLUDED.product_id, is_active = true
       RETURNING id`,
    [productInternalId, aliasName.trim(), normalized, actorId]
  );
  const id = inserted.rows[0]!.id;
  await client.query(
    `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'PRODUCT_ALIAS_CREATE', 'WORKSPACE_PRODUCT_ALIAS', $2, jsonb_build_object('productId', $3::int, 'aliasName', $4::text))`,
    [actorId, String(id), productInternalId, aliasName]
  );
  return id;
}

export async function createWorkspaceProductAlias(productInternalId: number, aliasName: string, actorId: number): Promise<number> {
  return withTransaction((client) => createWorkspaceProductAliasWithin(client, productInternalId, aliasName, actorId));
}
