import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { captureRequestTimingRef, recordQueryOn } from "@/server/monitoring/request-timing";

/**
 * `DATABASE_URL` WAJIB dari environment. SENGAJA tidak ada fallback hardcoded:
 * connection string Neon memuat kredensial, jadi menaruhnya di source berarti
 * siapa pun yang membaca repo memegang akses penuh ke database produksi —
 * sekaligus membuat environment yang salah konfigurasi diam-diam menulis ke
 * database yang keliru alih-alih gagal cepat. Sejalan dengan AUTH_SECRET di
 * src/server/auth/config.ts.
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error(
      "DATABASE_URL belum diset — wajib untuk terhubung ke Neon. " +
        "Set environment variable ini sebelum menjalankan aplikasi (termasuk di Vercel production)."
    );
  }
  return url
    .replace(/[\?&]channel_binding=[^&]*/g, "")
    .replace(/[\?&]sslmode=[^&]*/g, "")
    .replace(/\?$/, "");
}

/**
 * Lazy supaya import fungsi murni/test tidak menuntut DATABASE_URL, tapi hasilnya
 * dipakai ulang: satu request bisa memanggil getDb() puluhan kali dan tiap
 * pemanggilan sebelumnya membangun ulang klien neon+drizzle tanpa alasan.
 * Klien neon-http sendiri stateless (tiap query = satu HTTPS request), jadi
 * memakai ulang instance aman dan tidak menahan koneksi apa pun.
 */
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let cachedUrl: string | null = null;

/**
 * `.execute` dibungkus SEKALI di sini (bukan di tiap call site) untuk mencatat
 * jumlah & durasi query per request (monitoring §Q) — instrumentasi transparan,
 * tanpa mengubah satu pun query yang sudah ada. Method fluent lain
 * (`.select()`/`.insert()`/dst) TIDAK ikut terhitung; `.execute()` dengan
 * `sql\`...\`` tag adalah pola dominan di seluruh src/server (19 modul).
 */
function withQueryTiming(db: ReturnType<typeof drizzle<typeof schema>>): ReturnType<typeof drizzle<typeof schema>> {
  const original = db.execute.bind(db);
  db.execute = (async (...args: Parameters<typeof original>) => {
    // Ditangkap SEBELUM query (bukan lewat recordQuery() setelahnya) — lihat
    // catatan di captureRequestTimingRef() soal kenapa.
    const ctx = captureRequestTimingRef();
    const started = performance.now();
    try {
      return await original(...args);
    } finally {
      recordQueryOn(ctx, performance.now() - started);
    }
  }) as typeof db.execute;
  return db;
}

export function getDb() {
  const url = getDatabaseUrl();
  if (!cachedDb || cachedUrl !== url) {
    cachedUrl = url;
    cachedDb = withQueryTiming(drizzle(neon(url), { schema }));
  }
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;
