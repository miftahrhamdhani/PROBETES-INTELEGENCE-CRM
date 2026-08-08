/**
 * Regresi: "column cs_id is of type integer but expression is of type text".
 *
 * Penyebabnya BUKAN logika import, melainkan daftar cast `unnest(...)` yang
 * tidak lagi sejajar dengan daftar alias setelah kolom `workspace_total`
 * disisipkan di tengah (commit 026768a). Akibatnya `partner` (text) kebagian
 * ::int[] dan `cs_id` (integer) kebagian ::text[].
 *
 * Test unit lain memakai DB yang dimock, sehingga ketidaksesuaian TIPE tidak
 * pernah terlihat di sana — hanya Postgres sungguhan yang menolaknya. Test ini
 * menutup celah itu tanpa perlu DB: SQL-nya dibaca langsung dari source, lalu
 * setiap alias dipasangkan dengan cast pada posisi yang sama dan dicocokkan
 * dengan tipe kolom sebenarnya di schema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "src/server/import/orchestrator.ts"), "utf8");

/** Ambil blok `FROM unnest( ... ) AS t( ... )` milik bulkUpsertOrders. */
function ambilBlokUnnest(): { casts: string[]; aliases: string[] } {
  const mulai = SOURCE.indexOf("async function bulkUpsertOrders");
  expect(mulai).toBeGreaterThan(-1);
  const potongan = SOURCE.slice(mulai);

  const unnestMatch = /FROM unnest\(([\s\S]*?)\)\s*AS t\(([\s\S]*?)\)/.exec(potongan);
  if (!unnestMatch) throw new Error("Blok FROM unnest(...) AS t(...) tidak ditemukan di bulkUpsertOrders");

  const casts = [...unnestMatch[1]!.matchAll(/\$\d+::(\w+)\[\]/g)].map((m) => m[1]!);
  const aliases = unnestMatch[2]!
    .replace(/--[^\n]*/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return { casts, aliases };
}

/** Tipe yang diharapkan per alias, diturunkan dari kolom `orders` di schema. */
const TIPE_DIHARAPKAN: Record<string, "text" | "int" | "bool"> = {
  key: "text", // source_order_key text
  customer_id: "int", // integer FK
  order_date: "text", // di-cast ::date di SELECT
  total: "text", // di-cast ::bigint di SELECT
  workspace_total: "text", // ::bigint
  platform: "text",
  division: "text",
  payment_method: "text",
  partner: "text", // KOLOM TEXT — pernah salah jadi ::int[]
  cs_id: "int", // INTEGER FK ke cs_agents — pernah salah jadi ::text[]
  memo: "text",
  fingerprint: "text",
  transaction_status: "text", // ::crm_transaction_status
  is_crm: "bool",
  inclusion_reason: "text",
  mapping_version: "text",
  city: "text",
  hub: "text",
  sales_type: "text",
  shipping: "text", // ::bigint
  packing: "text", // ::bigint
  discount: "text", // ::bigint
  admin_cod: "text", // ::bigint
  marketing: "text", // ::bigint
  closing_count: "int", // integer
};

describe("bulkUpsertOrders — kesejajaran cast unnest dengan alias", () => {
  it("jumlah cast sama dengan jumlah alias", () => {
    const { casts, aliases } = ambilBlokUnnest();
    expect(casts.length).toBe(aliases.length);
  });

  it("setiap alias memakai cast bertipe benar (menangkap pergeseran posisi)", () => {
    const { casts, aliases } = ambilBlokUnnest();
    const salah: string[] = [];
    aliases.forEach((alias, i) => {
      const diharapkan = TIPE_DIHARAPKAN[alias];
      expect(diharapkan, `alias tak dikenal di test: ${alias}`).toBeDefined();
      if (casts[i] !== diharapkan) salah.push(`${alias}: ada ::${casts[i]}[], seharusnya ::${diharapkan}[]`);
    });
    expect(salah).toEqual([]);
  });

  it("cs_id WAJIB int[] — bukan text[] (bug yang dilaporkan)", () => {
    const { casts, aliases } = ambilBlokUnnest();
    expect(casts[aliases.indexOf("cs_id")]).toBe("int");
  });

  it("partner WAJIB text[] — kolomnya text, bukan angka", () => {
    const { casts, aliases } = ambilBlokUnnest();
    expect(casts[aliases.indexOf("partner")]).toBe("text");
  });

  it("cs_id diisi hasil resolve nama CS -> id numerik, bukan nama CS mentah", () => {
    const fn = SOURCE.slice(SOURCE.indexOf("async function bulkUpsertOrders"));
    // Nilai berasal dari Map<string, number> hasil bulkUpsertCsAgents.
    expect(fn).toContain("csIdByName.get(order.csName)");
    // Tidak boleh ada cast paksa nama CS ke integer.
    expect(fn).not.toMatch(/csName[^\n]*::integer/);
  });
});
