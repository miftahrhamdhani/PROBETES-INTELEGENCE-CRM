"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

/**
 * Update filter tersimpan di URL query — dipakai filter bar Overview/Pesanan/
 * Biaya Operasional/Master Data (docs prompt §6.1: "Simpan filter tanggal
 * dalam URL query parameter").
 *
 * `router.push` dibungkus `startTransition`: tanpa ini, setiap ganti filter
 * memicu `loading.tsx` route (mengganti SELURUH konten halaman dengan
 * skeleton), padahal tabel yang sedang ditampilkan masih valid untuk dilihat
 * sampai data baru siap. Dengan transition, Next.js mempertahankan UI saat ini
 * dan hanya menandai `isPending` — komponen pemanggil dipersilakan menampilkan
 * indikator ringan di sebelah filter tanpa mengosongkan tabel.
 */
export function useUrlFilterUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const update = React.useCallback(
    (patch: Record<string, string | null | undefined>, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }
      if (options?.resetPage !== false) params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  return Object.assign(update, { isPending });
}
