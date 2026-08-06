import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Monitoring performa ringan (audit performa/QA §Q) — TANPA dependency baru,
 * TANPA overhead besar: `AsyncLocalStorage` bawaan Node, satu counter + total
 * durasi per request.
 *
 * Sengaja TIDAK pernah mencatat: nama customer, nomor HP, alamat, token,
 * cookie, password, atau payload mentah — hanya ANGKA (jumlah query, durasi).
 *
 * `getDb()` (src/server/db/client.ts) menangkap context lewat
 * `captureRequestTimingRef()` SEBELUM tiap query dan memutasinya lewat
 * `recordQueryOn()` — BUKAN pola read-after-await (`getStore()` dipanggil
 * lagi setelah query selesai), karena driver Neon memakai `fetch()` global
 * (undici) di bawahnya, dan AsyncLocalStorage Node DIKENAL bisa kehilangan
 * context persis di seberang boundary `fetch()` pada beberapa versi Node —
 * dibuktikan langsung saat audit ini (`db_duration_ms` selalu 0 dengan pola
 * read-after-await, walau query sungguhan berjalan 100+ ms). Menangkap
 * REFERENSI objek context sebelum fetch, lalu memutasinya by-reference,
 * membuat pencatatan tetap benar terlepas dari perilaku propagasi context
 * runtime tersebut.
 */
export type RequestTimingContext = {
  queryCount: number;
  /** JUMLAH durasi tiap query (self time), BUKAN rentang wall-clock — kalau
   *  beberapa query berjalan paralel (`Promise.all`), angka ini bisa MELEBIHI
   *  `total` di Server-Timing. Itu bukan bug: nilainya justru berguna untuk
   *  membedakan "banyak query kecil paralel" dari "satu query lambat". */
  dbDurationMs: number;
};

const storage = new AsyncLocalStorage<RequestTimingContext>();

/** Bungkus satu request (route handler / server action) supaya query di
 *  dalamnya terhitung ke konteks yang sama. Aman dipanggil bersarang — konteks
 *  terluar yang berlaku (AsyncLocalStorage tidak menimpa run() bersarang tanpa
 *  disengaja karena setiap pemanggil membuat context BARU; pemanggil paling
 *  luar di suatu request-lah yang seharusnya memanggil ini). */
export function withRequestTiming<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ queryCount: 0, dbDurationMs: 0 }, fn);
}

export function getRequestTiming(): RequestTimingContext | undefined {
  return storage.getStore();
}

/** Alias eksplisit dari getRequestTiming() — dipanggil SEBELUM sebuah query
 *  (bukan sesudahnya), lihat catatan di kepala file. */
export function captureRequestTimingRef(): RequestTimingContext | undefined {
  return storage.getStore();
}

/** Tambahkan satu pengukuran query ke context yang SUDAH ditangkap lewat
 *  captureRequestTimingRef(). No-op kalau di luar konteks withRequestTiming
 *  (mis. script CLI) — tidak melempar, tidak menghalangi apa pun. */
export function recordQueryOn(ctx: RequestTimingContext | undefined, durationMs: number): void {
  if (!ctx) return;
  ctx.queryCount += 1;
  ctx.dbDurationMs += durationMs;
}

/**
 * Format nilai `Server-Timing` header standar — dipakai route handler (API)
 * yang bisa membangun `Response`/`NextResponse` sendiri. Server Component
 * (halaman) TIDAK bisa memakai ini: React Server Components di App Router
 * tidak mengizinkan mutasi response header dari dalam komponen — batasan
 * arsitektural Next.js, bukan pilihan desain di sini.
 */
export function serverTimingHeader(entries: Record<string, number>): string {
  return Object.entries(entries)
    .map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(ms))}`)
    .join(", ");
}

const LOGGING_DISABLED = process.env.DISABLE_PERF_LOGGING === "1";

/**
 * Log satu baris performa TANPA PII — dipakai route handler setelah selesai
 * memproses. Bisa dimatikan di production lewat env var `DISABLE_PERF_LOGGING=1`
 * tanpa mengubah kode. `route` adalah path template (mis. "/api/import/chunk"),
 * BUKAN URL lengkap yang mungkin memuat query string sensitif.
 *
 * `ctx` WAJIB berupa referensi yang ditangkap DARI DALAM callback
 * `withRequestTiming()` (via `captureRequestTimingRef()`), BUKAN hasil
 * `getRequestTiming()` yang dipanggil setelah `withRequestTiming()` selesai —
 * `AsyncLocalStorage.run()` hanya aktif selama callback-nya berjalan;
 * memanggil `getStore()` setelah `await withRequestTiming(...)` kembali ke
 * pemanggil SELALU mengembalikan `undefined` (bug nyata yang sempat membuat
 * `db_duration_ms` selalu 0 di sini, ditemukan & diperbaiki saat audit ini).
 */
export function logRouteTiming(
  route: string,
  status: number,
  ctx: RequestTimingContext | undefined,
  extra: Record<string, number> = {}
): void {
  if (LOGGING_DISABLED) return;
  const fields: Record<string, number> = {
    query_count: ctx?.queryCount ?? 0,
    db_duration_ms: Math.round(ctx?.dbDurationMs ?? 0),
    ...extra,
  };
  console.log(
    `[perf] route=${route} status=${status} ` + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ")
  );
}
