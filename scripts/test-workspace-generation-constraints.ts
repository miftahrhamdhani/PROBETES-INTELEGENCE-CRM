/**
 * Database test — perilaku UNIQUE constraint workspace_generation (migration
 * 0017_workspace_orders_generation_unique). Dijalankan sebagai script terpisah
 * (bukan tests/*.test.ts) karena tests/ 100% memakai getDb()/withTransaction
 * yang di-mock — verifikasi constraint SUNGGUHAN butuh koneksi Postgres nyata.
 *
 * AMAN dijalankan berulang kali terhadap database live: seluruh insert
 * berjalan dalam SATU transaksi yang SELALU di-ROLLBACK di akhir (baik semua
 * skenario lolos maupun tidak) — tidak ada baris yang pernah benar-benar
 * tersimpan.
 *
 * Skenario (docs prompt §M):
 *   1. Generation A + source_order_id X -> berhasil.
 *   2. Generation A + source_order_id X KEDUA -> ditolak (unique violation).
 *   3. Generation B + source_order_id X (sama) -> berhasil (generation beda).
 *   4. deterministic_fingerprint SAMA pada generation berbeda -> berhasil.
 *   5. match_fingerprint SAMA pada generation berbeda -> berhasil.
 *   6. match_fingerprint SAMA pada generation SAMA -> ditolak.
 */
import { withTransaction, type TransactionClient } from "../src/server/db/transaction";

const results: { name: string; pass: boolean; detail: string }[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
}

let seq = 0;
async function insertOrder(
  client: TransactionClient,
  opts: { generation: string; sourceOrderId?: string; fingerprint?: string; matchFingerprint?: string }
): Promise<void> {
  seq += 1;
  await client.query(
    `INSERT INTO workspace_orders
       (order_number, source_type, order_date, customer_name, normalized_phone,
        payment_method, crm_name_snapshot, workspace_generation, source_order_id,
        deterministic_fingerprint, match_fingerprint)
     VALUES ($1,'DATABASE_ALL','2026-01-01','Test Customer','628000000000',
             'TRANSFER','Test CRM',$2,$3,$4,$5)`,
    [
      `GEN-TEST-${seq}`,
      opts.generation,
      opts.sourceOrderId ?? null,
      opts.fingerprint ?? null,
      opts.matchFingerprint ?? null,
    ]
  );
}

async function expectSucceeds(client: TransactionClient, name: string, fn: () => Promise<void>) {
  try {
    await client.query("SAVEPOINT sp");
    await fn();
    await client.query("RELEASE SAVEPOINT sp");
    record(name, true, "insert berhasil seperti yang diharapkan");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT sp");
    record(name, false, `seharusnya berhasil, tapi ditolak: ${(error as Error).message}`);
  }
}

async function expectRejected(client: TransactionClient, name: string, fn: () => Promise<void>) {
  try {
    await client.query("SAVEPOINT sp");
    await fn();
    await client.query("RELEASE SAVEPOINT sp");
    record(name, false, "seharusnya ditolak (unique violation), tapi malah berhasil");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT sp");
    const message = (error as Error).message;
    const isUniqueViolation = /duplicate key value violates unique constraint/i.test(message);
    record(name, isUniqueViolation, isUniqueViolation ? "ditolak dengan unique violation, sesuai harapan" : `ditolak tapi BUKAN unique violation: ${message}`);
  }
}

try {
  await withTransaction(async (client) => {
    const sourceId = `SRC-${Date.now()}`;
    const fingerprint = `FP-${Date.now()}`;
    const matchFp = `MFP-${Date.now()}`;

    await expectSucceeds(client, "1. Generation A + source_order_id X -> berhasil", () =>
      insertOrder(client, { generation: "GEN_A", sourceOrderId: sourceId })
    );

    await expectRejected(client, "2. Generation A + source_order_id X KEDUA -> ditolak", () =>
      insertOrder(client, { generation: "GEN_A", sourceOrderId: sourceId })
    );

    await expectSucceeds(client, "3. Generation B + source_order_id X (sama) -> berhasil", () =>
      insertOrder(client, { generation: "GEN_B", sourceOrderId: sourceId })
    );

    await expectSucceeds(client, "4. deterministic_fingerprint sama, generation A -> berhasil (baseline)", () =>
      insertOrder(client, { generation: "GEN_A", fingerprint })
    );
    await expectSucceeds(client, "4. deterministic_fingerprint SAMA pada generation BERBEDA -> berhasil", () =>
      insertOrder(client, { generation: "GEN_B", fingerprint })
    );
    await expectRejected(client, "4b. deterministic_fingerprint sama, generation SAMA -> ditolak", () =>
      insertOrder(client, { generation: "GEN_A", fingerprint })
    );

    await expectSucceeds(client, "5. match_fingerprint sama, generation A -> berhasil (baseline)", () =>
      insertOrder(client, { generation: "GEN_A", matchFingerprint: matchFp })
    );
    await expectSucceeds(client, "5. match_fingerprint SAMA pada generation BERBEDA -> berhasil", () =>
      insertOrder(client, { generation: "GEN_B", matchFingerprint: matchFp })
    );
    await expectRejected(client, "6. match_fingerprint sama, generation SAMA -> ditolak", () =>
      insertOrder(client, { generation: "GEN_A", matchFingerprint: matchFp })
    );

    // SELALU rollback — tidak ada baris test yang boleh tersimpan permanen.
    throw new Error("__INTENTIONAL_ROLLBACK__");
  });
} catch (error) {
  if ((error as Error).message !== "__INTENTIONAL_ROLLBACK__") throw error;
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} skenario lolos. Seluruh data test di-rollback (tidak tersimpan).`);
if (results.some((r) => !r.pass)) process.exit(1);
