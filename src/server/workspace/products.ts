import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import { activeGenerationCondition, notDeletedCondition } from "@/server/workspace/generation";
import { workspaceManualOrderScope } from "@/server/workspace/provenance";
import type { WorkspaceItemType } from "@/lib/workspace-pesanan-contracts";
import {
  type WorkspaceProductAliasRow,
  type WorkspaceProductAliasUpdate,
  type WorkspaceProductBody,
  type WorkspaceProductCreateBody,
  type WorkspaceProductFilter,
  type WorkspaceProductKpi,
  type WorkspaceProductOption,
  type WorkspaceProductRow,
  type WorkspaceProductUsageRow,
} from "@/lib/workspace-master-data-contracts";
import { allowedItemTypesForUsage } from "@/lib/workspace-product-seed";

export class WorkspaceProductNotFoundError extends Error {}
export class WorkspaceProductDuplicateError extends Error {}
export class WorkspaceProductAliasDuplicateError extends Error {}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

const SORT_SQL: Record<WorkspaceProductFilter["sort"], SQL> = {
  product_id: sql`p.product_id`,
  product_name: sql`p.product_name`,
  selling_price: sql`p.selling_price`,
  unit_hpp: sql`p.unit_hpp`,
  product_usage: sql`p.product_usage`,
  status: sql`p.is_active`,
  alias_count: sql`alias_count`,
  usage_count: sql`usage_count`,
  updated_at: sql`p.updated_at`,
};

function filterConditions(filter: WorkspaceProductFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.status === "ACTIVE" || filter.includeInactive === false) conditions.push(sql`p.is_active = true`);
  if (filter.status === "INACTIVE") conditions.push(sql`p.is_active = false`);
  if (filter.productUsage) conditions.push(sql`p.product_usage = ${filter.productUsage}::workspace_product_usage`);
  if (filter.search?.trim()) {
    const search = `%${filter.search.trim()}%`;
    conditions.push(sql`(
      p.product_name ILIKE ${search}
      OR p.product_id ILIKE ${search}
      OR EXISTS (
        SELECT 1 FROM workspace_product_aliases search_alias
        WHERE search_alias.product_id = p.id AND search_alias.alias_name ILIKE ${search}
      )
    )`);
  }
  if (filter.minPrice != null) conditions.push(sql`p.selling_price >= ${filter.minPrice}`);
  if (filter.maxPrice != null) conditions.push(sql`p.selling_price <= ${filter.maxPrice}`);
  if (filter.minHpp != null) conditions.push(sql`p.unit_hpp >= ${filter.minHpp}`);
  if (filter.maxHpp != null) conditions.push(sql`p.unit_hpp <= ${filter.maxHpp}`);
  if (filter.alias === "HAS_ALIAS") conditions.push(sql`EXISTS (SELECT 1 FROM workspace_product_aliases fa WHERE fa.product_id = p.id AND fa.is_active)`);
  if (filter.alias === "NO_ALIAS") conditions.push(sql`NOT EXISTS (SELECT 1 FROM workspace_product_aliases fa WHERE fa.product_id = p.id AND fa.is_active)`);
  if (filter.used === "USED") conditions.push(sql`EXISTS (SELECT 1 FROM workspace_order_items fui WHERE fui.product_id = p.id)`);
  if (filter.used === "UNUSED") conditions.push(sql`NOT EXISTS (SELECT 1 FROM workspace_order_items fui WHERE fui.product_id = p.id)`);
  if (filter.createdFrom) conditions.push(sql`p.created_at >= ${filter.createdFrom}::date`);
  if (filter.createdTo) conditions.push(sql`p.created_at < (${filter.createdTo}::date + interval '1 day')`);
  if (filter.updatedFrom) conditions.push(sql`p.updated_at >= ${filter.updatedFrom}::date`);
  if (filter.updatedTo) conditions.push(sql`p.updated_at < (${filter.updatedTo}::date + interval '1 day')`);
  return conditions;
}

function mapProductRow(row: {
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
  usage_count: string;
}): WorkspaceProductRow {
  return {
    id: Number(row.id),
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
    usageCount: Number(row.usage_count),
  };
}

export async function listWorkspaceProducts(filter: WorkspaceProductFilter): Promise<{ rows: WorkspaceProductRow[]; total: number }> {
  const conditions = filterConditions(filter);
  const where = conditions.length ? andAll(conditions) : sql`true`;
  const offset = (filter.page - 1) * filter.perPage;
  const sort = SORT_SQL[filter.sort];
  const direction = filter.order === "desc" ? sql`DESC` : sql`ASC`;
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
      usage_count: string;
    }>(sql`
      SELECT p.id, p.product_id, p.product_name, p.selling_price::text, p.unit_hpp::text,
        p.product_usage::text AS product_usage, p.description, p.is_active,
        p.created_at::text, p.updated_at::text, creator.name AS created_by_name, updater.name AS updated_by_name,
        COALESCE(alias_stats.alias_count, 0)::text AS alias_count,
        COALESCE(usage_stats.usage_count, 0)::text AS usage_count
      FROM workspace_products p
      LEFT JOIN users creator ON creator.id = p.created_by
      LEFT JOIN users updater ON updater.id = p.updated_by
      LEFT JOIN (
        SELECT product_id, COUNT(*) FILTER (WHERE is_active)::int AS alias_count
        FROM workspace_product_aliases GROUP BY product_id
      ) alias_stats ON alias_stats.product_id = p.id
      LEFT JOIN (
        SELECT i.product_id, COUNT(DISTINCT i.order_id)::int AS usage_count
        FROM workspace_order_items i
        JOIN workspace_orders o ON o.id = i.order_id
        WHERE ${workspaceManualOrderScope("o")} AND ${activeGenerationCondition("o")} AND ${notDeletedCondition("o")}
        GROUP BY i.product_id
      ) usage_stats ON usage_stats.product_id = p.id
      WHERE ${where}
      ORDER BY ${sort} ${direction} NULLS LAST, p.product_id ASC
      LIMIT ${filter.perPage} OFFSET ${offset}
    `),
    getDb().execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM workspace_products p WHERE ${where}`),
  ]);
  return { rows: result.rows.map(mapProductRow), total: Number(countResult.rows[0]?.total ?? 0) };
}

export async function getWorkspaceProductKpi(): Promise<WorkspaceProductKpi> {
  const result = await getDb().execute<{
    total: string;
    active: string;
    inactive: string;
    sellable: string;
    bonus: string;
  }>(sql`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE is_active)::text AS active,
      COUNT(*) FILTER (WHERE NOT is_active OR product_usage = 'INACTIVE')::text AS inactive,
      COUNT(*) FILTER (WHERE product_usage IN ('SELLABLE', 'SELLABLE_AND_BONUS'))::text AS sellable,
      COUNT(*) FILTER (WHERE product_usage IN ('BONUS_ONLY', 'SELLABLE_AND_BONUS'))::text AS bonus
    FROM workspace_products
  `);
  const row = result.rows[0];
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    inactive: Number(row?.inactive ?? 0),
    sellable: Number(row?.sellable ?? 0),
    bonus: Number(row?.bonus ?? 0),
  };
}

export async function getWorkspaceProduct(id: number): Promise<WorkspaceProductRow> {
  const result = await getDb().execute<{
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
    usage_count: string;
  }>(sql`
    SELECT p.id, p.product_id, p.product_name, p.selling_price::text, p.unit_hpp::text,
      p.product_usage::text AS product_usage, p.description, p.is_active,
      p.created_at::text, p.updated_at::text, creator.name AS created_by_name, updater.name AS updated_by_name,
      (SELECT COUNT(*) FROM workspace_product_aliases a WHERE a.product_id = p.id AND a.is_active)::text AS alias_count,
      (SELECT COUNT(DISTINCT i.order_id) FROM workspace_order_items i WHERE i.product_id = p.id)::text AS usage_count
    FROM workspace_products p
    LEFT JOIN users creator ON creator.id = p.created_by
    LEFT JOIN users updater ON updater.id = p.updated_by
    WHERE p.id = ${id}
  `);
  if (!result.rows[0]) throw new WorkspaceProductNotFoundError("Produk tidak ditemukan");
  return mapProductRow(result.rows[0]);
}

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
    id: Number(row.id),
    productId: row.product_id,
    productName: row.product_name,
    sellingPrice: row.selling_price,
    unitHpp: row.unit_hpp,
    productUsage: row.product_usage,
  }));
  if (!itemType) return rows;
  return rows.filter((row) => allowedItemTypesForUsage(row.productUsage).includes(itemType));
}

export async function createWorkspaceProduct(body: WorkspaceProductCreateBody, actorId: number): Promise<number> {
  return withTransaction(async (client) => {
    const duplicate = await client.query("SELECT 1 FROM workspace_products WHERE UPPER(product_id) = UPPER($1) LIMIT 1", [body.productId]);
    if (duplicate.rowCount) throw new WorkspaceProductDuplicateError("Product ID sudah digunakan");
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO workspace_products (product_id, product_name, selling_price, unit_hpp, product_usage, description, is_active, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5::workspace_product_usage,$6,$7,$8,$8) RETURNING id`,
      [body.productId, body.productName, body.sellingPrice, body.unitHpp, body.productUsage, body.description ?? null, body.isActive, actorId]
    );
    const id = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'PRODUCT_CREATE', 'WORKSPACE_PRODUCT', $2, $3::jsonb)`,
      [actorId, String(id), JSON.stringify(body)]
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
    if (!before.rows[0]) throw new WorkspaceProductNotFoundError("Produk tidak ditemukan");
    await client.query(
      `UPDATE workspace_products SET product_name=$2, selling_price=$3, unit_hpp=$4, product_usage=$5::workspace_product_usage,
        description=$6, is_active=$7, updated_by=$8, updated_at=now() WHERE id=$1`,
      [id, body.productName, body.sellingPrice, body.unitHpp, body.productUsage, body.description ?? null, body.isActive, actorId]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'PRODUCT_UPDATE', 'WORKSPACE_PRODUCT', $2, $3::jsonb, $4::jsonb)`,
      [actorId, String(id), JSON.stringify(before.rows[0]), JSON.stringify(body)]
    );
  });
}

async function setWorkspaceProductsActiveWithin(
  client: TransactionClient,
  ids: number[],
  active: boolean,
  actorId: number,
  reason?: string
): Promise<number> {
  const before = await client.query<{ id: number; product_usage: string; is_active: boolean }>(
    `SELECT id, product_usage, is_active FROM workspace_products WHERE id = ANY($1::int[]) FOR UPDATE`,
    [ids]
  );
  if (!before.rowCount) throw new WorkspaceProductNotFoundError("Produk tidak ditemukan");
  if (active) {
    await client.query(
      `WITH restored AS (
         SELECT p.id,
           CASE
             WHEN p.product_usage <> 'INACTIVE' THEN p.product_usage
             WHEN p.selling_price IS NULL THEN 'BONUS_ONLY'::workspace_product_usage
             ELSE COALESCE(
               (
                 SELECT (a.before_value->>'product_usage')::workspace_product_usage
                 FROM crm_audit_logs a
                 WHERE a.entity_type='WORKSPACE_PRODUCT' AND a.entity_id=p.id::text
                   AND a.action='PRODUCT_DEACTIVATE'
                   AND a.before_value->>'product_usage' IN ('SELLABLE','BONUS_ONLY','SELLABLE_AND_BONUS')
                 ORDER BY a.created_at DESC LIMIT 1
               ),
               'SELLABLE_AND_BONUS'::workspace_product_usage
             )
           END AS product_usage
         FROM workspace_products p WHERE p.id = ANY($1::int[])
       )
       UPDATE workspace_products p
       SET is_active=true, product_usage=restored.product_usage, updated_by=$2, updated_at=now()
       FROM restored WHERE p.id=restored.id`,
      [ids, actorId]
    );
  } else {
    await client.query(
      `UPDATE workspace_products SET product_usage='INACTIVE'::workspace_product_usage, is_active=false, updated_by=$2, updated_at=now()
       WHERE id = ANY($1::int[])`,
      [ids, actorId]
    );
  }
  for (const product of before.rows) {
    const after = await client.query<{ product_usage: string; is_active: boolean }>(
      "SELECT product_usage, is_active FROM workspace_products WHERE id=$1",
      [product.id]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, $2, 'WORKSPACE_PRODUCT', $3, $4::jsonb, $5::jsonb, $6)`,
      [
        actorId,
        active ? "PRODUCT_REACTIVATE" : "PRODUCT_DEACTIVATE",
        String(product.id),
        JSON.stringify(product),
        JSON.stringify(after.rows[0]),
        reason ?? null,
      ]
    );
  }
  return before.rowCount;
}

export async function setWorkspaceProductsActive(ids: number[], active: boolean, actorId: number, reason?: string): Promise<number> {
  return withTransaction((client) => setWorkspaceProductsActiveWithin(client, ids, active, actorId, reason));
}

export async function deactivateWorkspaceProduct(id: number, actorId: number, reason: string): Promise<void> {
  await setWorkspaceProductsActive([id], false, actorId, reason);
}

export async function reactivateWorkspaceProduct(id: number, actorId: number): Promise<void> {
  await setWorkspaceProductsActive([id], true, actorId);
}

export async function listWorkspaceProductAliases(productInternalId: number): Promise<WorkspaceProductAliasRow[]> {
  const result = await getDb().execute<{
    id: number;
    product_id: number;
    source_system: string;
    alias_name: string;
    alias_normalized: string;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    created_by_name: string | null;
  }>(sql`
    SELECT a.id, a.product_id, a.source_system, a.alias_name, a.alias_normalized, a.notes, a.is_active, a.created_at::text,
      creator.name AS created_by_name
    FROM workspace_product_aliases a LEFT JOIN users creator ON creator.id = a.created_by
    WHERE a.product_id = ${productInternalId} ORDER BY a.alias_name
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.product_id),
    sourceSystem: row.source_system,
    aliasName: row.alias_name,
    aliasNormalized: row.alias_normalized,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }));
}

export function normalizeProductAlias(value: string): string {
  return value.trim().toLocaleUpperCase("id-ID").replace(/\s+/g, " ");
}

export async function createWorkspaceProductAliasWithin(
  client: TransactionClient,
  productInternalId: number,
  aliasName: string,
  actorId: number,
  sourceSystem = "DATABASE_ALL",
  notes?: string | null
): Promise<number> {
  const normalized = normalizeProductAlias(aliasName);
  const existing = await client.query<{ id: number; product_id: number }>(
    "SELECT id, product_id FROM workspace_product_aliases WHERE alias_normalized = $1 FOR UPDATE",
    [normalized]
  );
  if (existing.rows[0] && existing.rows[0].product_id !== productInternalId) {
    throw new WorkspaceProductAliasDuplicateError("Alias sudah diarahkan ke produk lain");
  }
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO workspace_product_aliases (product_id, source_system, alias_name, alias_normalized, notes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       ON CONFLICT (alias_normalized) DO UPDATE SET alias_name=EXCLUDED.alias_name, source_system=EXCLUDED.source_system,
         notes=EXCLUDED.notes, is_active=true
       RETURNING id`,
    [productInternalId, sourceSystem, aliasName.trim(), normalized, notes ?? null, actorId]
  );
  const id = inserted.rows[0]!.id;
  await client.query(
    `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'PRODUCT_ALIAS_CREATE', 'WORKSPACE_PRODUCT_ALIAS', $2,
         jsonb_build_object('productId', $3::int, 'aliasName', $4::text, 'sourceSystem', $5::text))`,
    [actorId, String(id), productInternalId, aliasName, sourceSystem]
  );
  return id;
}

export async function createWorkspaceProductAlias(
  productInternalId: number,
  aliasName: string,
  actorId: number,
  sourceSystem = "DATABASE_ALL",
  notes?: string | null
): Promise<number> {
  return withTransaction((client) => createWorkspaceProductAliasWithin(client, productInternalId, aliasName, actorId, sourceSystem, notes));
}

export async function updateWorkspaceProductAlias(id: number, body: WorkspaceProductAliasUpdate, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query<Record<string, unknown> & { product_id: number }>(
      "SELECT product_id, source_system, alias_name, alias_normalized, notes, is_active FROM workspace_product_aliases WHERE id=$1 FOR UPDATE",
      [id]
    );
    if (!before.rows[0]) throw new WorkspaceProductNotFoundError("Alias tidak ditemukan");
    const normalized = normalizeProductAlias(body.aliasName);
    const conflict = await client.query("SELECT 1 FROM workspace_product_aliases WHERE alias_normalized=$1 AND id<>$2", [normalized, id]);
    if (conflict.rowCount) throw new WorkspaceProductAliasDuplicateError("Alias sudah digunakan");
    await client.query(
      `UPDATE workspace_product_aliases SET source_system=$2, alias_name=$3, alias_normalized=$4, notes=$5, is_active=$6 WHERE id=$1`,
      [id, body.sourceSystem, body.aliasName, normalized, body.notes ?? null, body.isActive]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'PRODUCT_ALIAS_UPDATE', 'WORKSPACE_PRODUCT_ALIAS', $2, $3::jsonb, $4::jsonb)`,
      [actorId, String(id), JSON.stringify(before.rows[0]), JSON.stringify(body)]
    );
  });
}

export async function listWorkspaceProductUsage(
  productInternalId: number,
  page: number,
  perPage: number
): Promise<{ rows: WorkspaceProductUsageRow[]; total: number }> {
  const offset = (page - 1) * perPage;
  const [result, count] = await Promise.all([
    getDb().execute<{
      order_id: number;
      order_number: string;
      order_date: string;
      customer_name: string;
      item_type: WorkspaceProductUsageRow["itemType"];
      quantity: string;
      selling_price_snapshot: string;
      unit_hpp_snapshot: string;
    }>(sql`
      SELECT o.id AS order_id, o.order_number, o.order_date::text, o.customer_name,
        i.item_type::text AS item_type, i.quantity::text, i.selling_price_snapshot::text, i.unit_hpp_snapshot::text
      FROM workspace_order_items i
      JOIN workspace_orders o ON o.id = i.order_id
      WHERE i.product_id = ${productInternalId}
        AND ${workspaceManualOrderScope("o")}
        AND ${activeGenerationCondition("o")}
        AND ${notDeletedCondition("o")}
      ORDER BY o.order_date DESC, o.id DESC
      LIMIT ${perPage} OFFSET ${offset}
    `),
    getDb().execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total
      FROM workspace_order_items i
      JOIN workspace_orders o ON o.id = i.order_id
      WHERE i.product_id = ${productInternalId}
        AND ${workspaceManualOrderScope("o")}
        AND ${activeGenerationCondition("o")}
        AND ${notDeletedCondition("o")}
    `),
  ]);
  return {
    rows: result.rows.map((row) => ({
      orderId: Number(row.order_id),
      orderNumber: row.order_number,
      orderDate: row.order_date,
      customerName: row.customer_name,
      itemType: row.item_type,
      quantity: row.quantity,
      sellingPriceSnapshot: row.selling_price_snapshot,
      unitHppSnapshot: row.unit_hpp_snapshot,
    })),
    total: Number(count.rows[0]?.total ?? 0),
  };
}
