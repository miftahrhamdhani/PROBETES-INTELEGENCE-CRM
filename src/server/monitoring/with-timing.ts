import { NextResponse } from "next/server";
import {
  captureRequestTimingRef,
  logRouteTiming,
  serverTimingHeader,
  withRequestTiming,
  type RequestTimingContext,
} from "./request-timing";

/**
 * Bungkus satu route handler (API) dengan pengukuran performa (§Q): jumlah
 * query, durasi DB, dan durasi total server — dikirim sebagai header
 * `Server-Timing` standar (terlihat di tab Network browser & alat APM apa
 * pun) DAN dicatat lewat `logRouteTiming` (bisa dimatikan lewat
 * `DISABLE_PERF_LOGGING=1`, tidak pernah memuat PII).
 *
 * HANYA berlaku untuk route.ts (Response penuh di tangan kita). Server
 * Component (halaman) tidak bisa memakai ini — App Router tidak mengizinkan
 * komponen memutasi header response, itu batasan arsitektural Next.js.
 */
export function withTiming(route: string, handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    let timing: RequestTimingContext | undefined;
    // Ambil referensi context DARI DALAM callback (masih di scope
    // storage.run()) — memanggilnya setelah await di bawah selesai akan
    // selalu dapat undefined, lihat catatan di request-timing.ts.
    const response = await withRequestTiming(async () => {
      timing = captureRequestTimingRef();
      return handler(request);
    });
    const serverDurationMs = performance.now() - started;

    logRouteTiming(route, response.status, timing, { server_duration_ms: Math.round(serverDurationMs) });

    const headers = new Headers(response.headers);
    headers.set(
      "Server-Timing",
      serverTimingHeader({
        db: timing?.dbDurationMs ?? 0,
        total: serverDurationMs,
      })
    );
    return new NextResponse(response.body, { status: response.status, headers });
  };
}
