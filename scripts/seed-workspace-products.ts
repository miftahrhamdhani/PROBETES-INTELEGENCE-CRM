import { sql } from "drizzle-orm";
import { getDb } from "../src/server/db/client";
import { WORKSPACE_PRODUCT_SEED } from "../src/lib/workspace-product-seed";

const db = getDb();

for (const product of WORKSPACE_PRODUCT_SEED) {
  await db.execute(sql`
    INSERT INTO workspace_products (product_id, product_name, selling_price, unit_hpp, product_usage, description, is_active)
    VALUES (
      ${product.productId}, ${product.productName},
      ${product.sellingPrice != null ? BigInt(product.sellingPrice) : null},
      ${BigInt(product.unitHpp)}, ${product.productUsage}::workspace_product_usage,
      ${product.description}, true
    )
    ON CONFLICT (product_id) DO UPDATE SET
      product_name = EXCLUDED.product_name,
      selling_price = EXCLUDED.selling_price,
      unit_hpp = EXCLUDED.unit_hpp,
      product_usage = EXCLUDED.product_usage,
      description = EXCLUDED.description,
      updated_at = now()
  `);
}

console.log(`Seed Master Data selesai: ${WORKSPACE_PRODUCT_SEED.length} produk.`);
