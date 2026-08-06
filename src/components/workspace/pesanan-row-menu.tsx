"use client";

import { ArrowRightLeft, Eye, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PesananMenuTarget = { ids: number[]; x: number; y: number };

/**
 * Klik kanan pada baris Pesanan — Edit Data/Lihat Data HANYA aktif untuk tepat
 * SATU target (baik dari checkbox tercentang, atau baris yang diklik kanan
 * saat tidak ada centang sama sekali); "Pindahkan" (dua arah, lihat moveLabel)
 * berlaku untuk seluruh target, berapa pun jumlahnya. `target.ids` sudah
 * dihitung oleh pemanggil (PesananManager): centang aktif -> pakai itu, kosong
 * -> satu baris yang diklik kanan. Dialog konfirmasi "Pindahkan" dimiliki
 * PesananManager (dipakai bersama tombol yang sama di PesananBulkToolbar),
 * bukan di sini.
 */
export function PesananRowMenu({
  target,
  onClose,
  onEdit,
  onView,
  moveLabel,
  onRequestMove,
}: {
  target: PesananMenuTarget | null;
  onClose: () => void;
  onEdit: (id: number) => void;
  onView: (id: number) => void;
  /** Label aksi "Pindahkan" — beda per tab ("Pindahkan ke Retur & Refund" di
   *  Semua Pesanan, "Pindahkan ke Pesanan" di Retur & Refund). */
  moveLabel: string;
  onRequestMove: (ids: number[]) => void;
}) {
  const single = target && target.ids.length === 1 ? target.ids[0]! : null;

  return (
    <DropdownMenu open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          style={{ position: "fixed", left: target?.x ?? 0, top: target?.y ?? 0, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-64">
        {target ? (
          <>
            <DropdownMenuLabel className="normal-case text-foreground">
              {target.ids.length === 1 ? `Pesanan #${target.ids[0]}` : `${target.ids.length} pesanan dipilih`}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={single == null}
              onSelect={() => {
                if (single != null) onEdit(single);
                onClose();
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Data
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={single == null}
              onSelect={() => {
                if (single != null) onView(single);
                onClose();
              }}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Lihat Data
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onRequestMove(target.ids);
                onClose();
              }}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {moveLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
