import { sql } from "drizzle-orm";
import { getDb } from "../src/server/db/client";
import {
  CANONICAL_PRODUCT_CODES,
  EXPLICIT_PRODUCT_ALIASES,
  canonicalizeForMatching,
  productFlagsForCode,
} from "../src/server/normalize/product-catalog";

const db = getDb();

for (const code of CANONICAL_PRODUCT_CODES) {
  const flags = productFlagsForCode(code);
  await db.execute(sql`
    INSERT INTO products (
      code, name, category, is_probetes, is_ksb_product, is_ebook,
      is_book_entry, is_hp_or_amandia, is_target_physical, active
    ) VALUES (
      ${code}, ${displayName(code)}, ${category(code)}::product_category,
      ${code !== "YACONA" && code !== "UNKNOWN"}, ${flags.isKsbProduct}, ${flags.isEbook},
      ${flags.isBookEntry}, ${flags.isHpOrAmandia}, ${flags.isTargetPhysical}, true
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      is_probetes = EXCLUDED.is_probetes,
      is_ksb_product = EXCLUDED.is_ksb_product,
      is_ebook = EXCLUDED.is_ebook,
      is_book_entry = EXCLUDED.is_book_entry,
      is_hp_or_amandia = EXCLUDED.is_hp_or_amandia,
      is_target_physical = EXCLUDED.is_target_physical,
      active = true
  `);
}

for (const [rawName, code] of Object.entries(EXPLICIT_PRODUCT_ALIASES)) {
  await db.execute(sql`
    INSERT INTO product_aliases (raw_name, normalized_name, product_id, approved_at)
    SELECT ${rawName}, ${canonicalizeForMatching(rawName)}, id, now()
    FROM products WHERE code = ${code}
    ON CONFLICT (normalized_name) DO UPDATE SET
      raw_name = EXCLUDED.raw_name,
      product_id = EXCLUDED.product_id,
      approved_at = COALESCE(product_aliases.approved_at, EXCLUDED.approved_at)
  `);
}

console.log(`Seed selesai: ${CANONICAL_PRODUCT_CODES.length} produk canonical.`);

function displayName(code: (typeof CANONICAL_PRODUCT_CODES)[number]): string {
  return code
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

function category(code: (typeof CANONICAL_PRODUCT_CODES)[number]) {
  if (code === "UNKNOWN") return "UNKNOWN";
  if (code === "EBOOK") return "DIGITAL";
  if (code.startsWith("BUKU_")) return "BOOK";
  return "PHYSICAL";
}
