"use client";

import * as React from "react";
import { CheckSquare, ClipboardCopy, Eye, Send } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MenuTarget = { customerId: number; name: string; phone: string; x: number; y: number };

/**
 * Menu Lihat data / Copy data / Masukkan ke Pembagian Tugas — dipicu klik kanan
 * ATAU tombol ⋮ per baris (Customers & Customer Cluster). SATU instance
 * dirender oleh tabel pemanggil (bukan per baris) supaya cukup satu Portal;
 * posisinya mengikuti titik klik lewat anchor tak terlihat (`asChild`, 0×0,
 * position:fixed) — Radix Popper menghitung posisi popup dari elemen itu.
 *
 * Sudah menangani collision-avoidance viewport, Escape, dan klik-di-luar
 * bawaan Radix — tidak perlu dependensi baru.
 */
export function CustomerRowMenu({
  target,
  onClose,
  onView,
  onAddToTasks,
  candidateCount = 0,
  onCommitCandidates,
}: {
  target: MenuTarget | null;
  onClose: () => void;
  onView: (customerId: number) => void;
  onAddToTasks: (customers: { id: number; name: string; phone: string }[]) => void;
  candidateCount?: number;
  onCommitCandidates?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (target) setCopied(false);
  }, [target]);

  async function handleCopy() {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(`${target.name}\n${target.phone}`);
      setCopied(true);
    } catch {
      // Clipboard API bisa ditolak browser (izin/HTTP non-secure) — menu tetap
      // tertutup normal, tidak ada crash. Tidak ada fallback lebih jauh di V1.
    }
  }

  return (
    <DropdownMenu open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          style={{ position: "fixed", left: target?.x ?? 0, top: target?.y ?? 0, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        {target ? (
          <>
            <DropdownMenuLabel className="truncate normal-case text-foreground">{target.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {candidateCount > 0 && onCommitCandidates ? (
              <>
                <DropdownMenuItem onSelect={onCommitCandidates}>
                  <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Centang customer terpilih ({candidateCount})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onSelect={handleCopy}>
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? "Tersalin!" : "Copy data"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onView(target.customerId)}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Lihat data
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onAddToTasks([{ id: target.customerId, name: target.name, phone: target.phone }])}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Masukkan ke Pembagian Tugas
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
