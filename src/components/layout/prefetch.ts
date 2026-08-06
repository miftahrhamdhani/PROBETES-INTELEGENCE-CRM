import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Route yang dipakai eager (viewport-based, perilaku default `next/link`) —
 * daftar prioritas dari audit performa (§D): frekuensi akses tertinggi.
 * Sisanya diprefetch terkontrol (hover/focus), BUKAN dimatikan total —
 * supaya tidak ada "prefetch seluruh aplikasi sekaligus" sekaligus tidak ada
 * jeda navigasi untuk route yang jarang dipakai.
 */
export const EAGER_PREFETCH_HREFS: ReadonlySet<string> = new Set([
  "/",
  "/customers",
  "/cluster",
  "/rfm",
  "/groups",
  "/workspace/overview",
  "/workspace/pesanan",
  "/workspace/pembagian-tugas",
  "/workspace/master-data",
  "/workspace/biaya-operasional",
]);

/**
 * Props terkontrol untuk `next/link`: route prioritas memakai prefetch bawaan
 * Next.js (viewport), sisanya BARU diprefetch saat hover/focus — sidebar
 * selalu terlihat penuh begitu mount, jadi tanpa ini seluruh menu (termasuk
 * yang jarang dibuka) akan langsung diprefetch bersamaan saat halaman dimuat.
 *
 * Tidak perlu pengecekan permission terpisah: pemanggil hanya pernah menerima
 * `href` dari `visibleNavNodes(role)`, yang sudah difilter sebelum sampai ke sini.
 */
export function usePrefetchLinkProps(href: string) {
  const router = useRouter();
  const eager = EAGER_PREFETCH_HREFS.has(href);
  const requested = React.useRef(false);

  const handlePrefetch = React.useCallback(() => {
    if (eager || requested.current) return;
    requested.current = true;
    router.prefetch(href);
  }, [eager, href, router]);

  return {
    prefetch: eager ? undefined : false,
    onMouseEnter: handlePrefetch,
    onFocus: handlePrefetch,
  } as const;
}
