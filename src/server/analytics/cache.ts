/**
 * BACKEND — cache agregat analytics berbasis TAG.
 *
 * Yang boleh masuk sini HANYA data agregat tanpa PII (Dashboard/Cohort/
 * Frequency/RFM: hitungan per bucket, per cohort, per cluster). Daftar customer,
 * CRM Report, dan Workspace TIDAK PERNAH di-cache di sini — isinya nama/No.HP dan
 * hasilnya bergantung role/filter, jadi berbagi cache lintas pemanggil berisiko.
 *
 * Kapan isinya berubah? Hanya saat data sumber berubah:
 *   - commit import Database All
 *   - import/backfill KSB
 *   - approve product mapping (mengubah product_id item -> cluster)
 *   - edit membership (mengubah has_group -> cluster)
 *   - rekalkulasi cluster
 * Semua titik itu memanggil revalidateAnalytics().
 *
 * Catatan BigInt: nilai uang disimpan bigint (CLAUDE.md #7), sedangkan cache
 * Next.js menyerialisasi hasil fungsi. Karena itu payload di-encode ke JSON
 * dengan penanda bigint lalu dipulihkan saat dibaca — nilainya tetap bigint
 * persis, bukan number yang bisa kehilangan presisi.
 */
import { revalidateTag, unstable_cache } from "next/cache";

export const ANALYTICS_CACHE_TAG = "analytics-aggregate";

/** Umur maksimum sebagai jaring pengaman kalau ada jalur tulis yang lupa
 *  memanggil revalidateAnalytics — bukan mekanisme utama. */
const MAX_AGE_SECONDS = 300;

const BIGINT_PREFIX = "__bigint__:";

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? `${BIGINT_PREFIX}${v}` : v));
}

function decode<T>(raw: string): T {
  return JSON.parse(raw, (_key, v) =>
    typeof v === "string" && v.startsWith(BIGINT_PREFIX) ? BigInt(v.slice(BIGINT_PREFIX.length)) : v
  ) as T;
}

/**
 * Bungkus fungsi analytics agregat supaya hasilnya dipakai ulang sampai
 * tag di-invalidate. `keyParts` harus memuat SELURUH parameter yang memengaruhi
 * hasil (mis. filter tanggal Dashboard) supaya tidak ada hasil salah-pakai.
 */
export function cachedAggregate<T>(
  keyParts: string[],
  load: () => Promise<T>
): () => Promise<T> {
  const cached = unstable_cache(async () => encode(await load()), ["analytics", ...keyParts], {
    tags: [ANALYTICS_CACHE_TAG],
    revalidate: MAX_AGE_SECONDS,
  });
  return async () => decode<T>(await cached());
}

/**
 * Dipanggil setiap kali data sumber analytics berubah.
 *
 * `revalidateTag` hanya sah di dalam request Next.js (Server Action / route
 * handler). Script CLI seperti scripts/backfill-ksb-drift.ts berjalan di luar
 * konteks itu — di sana pembatalan tidak diperlukan (tidak ada cache proses yang
 * hidup) dan tidak boleh menggagalkan pekerjaan. Karena itu error konteks
 * ditelan; error lain tetap dilempar.
 */
export function revalidateAnalytics(): void {
  try {
    revalidateTag(ANALYTICS_CACHE_TAG);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("static generation store")) throw error;
  }
}
