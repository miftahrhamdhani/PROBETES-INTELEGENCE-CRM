import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Indikator "Memuat data..." ringan untuk dipasang di sebelah filter/pagination
 * — dipakai bersama navigasi yang dibungkus `startTransition` (lihat
 * use-url-filter.ts), di mana konten lama SENGAJA tetap tampil sampai data
 * baru siap. Komponen ini adalah satu-satunya sinyal visual bahwa permintaan
 * sedang berjalan, karena tabel/kartu di baliknya tidak diganti skeleton.
 */
export function PendingIndicator({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Memuat data...
    </span>
  );
}
