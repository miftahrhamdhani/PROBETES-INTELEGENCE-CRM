import { cache } from "react";
import { sql } from "drizzle-orm";
import type { ActiveDatasetInfo, ActiveSourceSummary, DatasetContext } from "@/lib/dataset-types";
import { getDb } from "@/server/db/client";

/**
 * SATU query yang melayani seluruh kebutuhan "status dataset" dalam satu request:
 * AppShell (tanggal + status 3 sumber), gerbang analytics (ada batch aktif?),
 * dan as_of_date untuk seluruh query analitik.
 *
 * Dibungkus React `cache()` — memoization PER-REQUEST, bukan render. Tanpa ini
 * AppShell dan page-nya masing-masing menembak DB untuk informasi yang sama,
 * dan tiap fungsi analytics dulu menjalankan MAX(order_date) sendiri-sendiri
 * (Dashboard sampai 3x per load). Ini satu-satunya alasan src/server menyentuh
 * `react` di sini; tidak ada JSX dan tetap bisa diuji tanpa render
 * (lihat pengecualian di eslint.config.mjs).
 *
 * as_of_date = MAX(orders.order_date). Tabel `orders` hanya berisi transaksi
 * Probetes (item KSB sudah dipisah sejak parser), jadi ini otomatis
 * "Probetes-only" sesuai docs/02-CLUSTER-RULES.md §3.3. BUKAN NOW().
 */
const loadDatasetSnapshot = cache(async (): Promise<ActiveDatasetInfo> => {
  const result = await getDb().execute<{
    as_of_date: string | null;
    database_all_active: boolean;
    ksb_active: boolean;
    group_list_active: boolean;
  }>(sql`
    SELECT
      (SELECT MAX(order_date)::text FROM orders) AS as_of_date,
      EXISTS (SELECT 1 FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active) AS database_all_active,
      EXISTS (SELECT 1 FROM import_batches WHERE source_type = 'KSB' AND is_active) AS ksb_active,
      EXISTS (SELECT 1 FROM import_batches WHERE source_type = 'GROUP_LIST' AND is_active) AS group_list_active
  `);
  const row = result.rows[0];
  const databaseAllActive = Boolean(row?.database_all_active);
  return {
    // Tanpa batch aktif, analytics harus kosong (empty state) — as_of ikut null
    // supaya tidak ada angka yang terlihat "hidup" padahal dataset belum aktif.
    asOfDate: databaseAllActive ? row?.as_of_date ?? null : null,
    databaseAllActive,
    ksbActive: Boolean(row?.ksb_active),
    groupListActive: Boolean(row?.group_list_active),
  };
});

export async function getActiveDatasetInfo(): Promise<ActiveDatasetInfo> {
  return loadDatasetSnapshot();
}

/** Bentuk ringkas untuk query analytics — sumbernya snapshot yang sama. */
export async function getDatasetContext(): Promise<DatasetContext> {
  const info = await loadDatasetSnapshot();
  return { hasActiveDatabaseAll: info.databaseAllActive, asOfDate: info.asOfDate };
}

/**
 * Status NYATA ketiga sumber untuk kartu "Active sources" Dashboard.
 * Tidak ada teks placeholder "belum diimport" yang di-hardcode di UI — kalau
 * sebuah sumber memang belum ada batch aktifnya, `active:false` datang dari DB.
 *
 * `canonicalRows` sengaja dihitung dari tabel canonical (bukan dari
 * import_batches.total_rows) karena keduanya menjawab pertanyaan berbeda:
 * berapa baris di file sumber vs berapa baris yang benar-benar jadi data.
 */
export async function listActiveSources(): Promise<ActiveSourceSummary[]> {
  const result = await getDb().execute<{
    source_type: string;
    filename: string | null;
    source_rows: number | null;
    as_of_date: string | null;
    uploaded_at: string | null;
    canonical_rows: string | null;
  }>(sql`
    WITH active AS (
      SELECT source_type::text AS source_type, filename, total_rows, as_of_date::text, uploaded_at
      FROM import_batches
      WHERE is_active = true
    ),
    wanted(source_type, sort_order) AS (
      VALUES ('DATABASE_ALL', 1), ('KSB', 2), ('GROUP_LIST', 3)
    )
    SELECT
      w.source_type,
      a.filename,
      a.total_rows AS source_rows,
      a.as_of_date,
      a.uploaded_at::text,
      CASE w.source_type
        WHEN 'DATABASE_ALL' THEN (SELECT COUNT(*) FROM orders)
        WHEN 'KSB'          THEN (SELECT COUNT(*) FROM ksb_transactions)
        WHEN 'GROUP_LIST'   THEN (SELECT COUNT(*) FROM customer_group_memberships)
      END::text AS canonical_rows
    FROM wanted w
    LEFT JOIN active a ON a.source_type = w.source_type
    ORDER BY w.sort_order
  `);

  const META: Record<string, { label: string; canonicalLabel: string }> = {
    DATABASE_ALL: { label: "Database All", canonicalLabel: "order kanonik" },
    KSB: { label: "Legacy KSB (historis)", canonicalLabel: "transaksi KSB" },
    GROUP_LIST: { label: "Group Membership (legacy)", canonicalLabel: "membership" },
  };

  return result.rows.map((row) => {
    const meta = META[row.source_type] ?? { label: row.source_type, canonicalLabel: "baris" };
    return {
      sourceType: row.source_type as ActiveSourceSummary["sourceType"],
      label: meta.label,
      active: row.filename !== null,
      filename: row.filename,
      sourceRows: row.source_rows,
      canonicalRows: row.canonical_rows === null ? null : Number(row.canonical_rows),
      canonicalLabel: meta.canonicalLabel,
      asOfDate: row.as_of_date,
      uploadedAt: row.uploaded_at,
    };
  });
}
