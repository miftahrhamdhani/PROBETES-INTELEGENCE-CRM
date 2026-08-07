"use client";

import { Ban, Download, Send, UserCog, UserMinus, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toolbar muncul saat ada baris yang dicentang. Setiap aksi meloop Server
 *  Action per-customer yang SUDAH ADA (lihat bulk-membership-actions.ts) —
 *  tidak ada endpoint tulis baru di sini, murni orkestrasi frontend.
 *
 *  Handler selain onAddToTasks/onClear OPSIONAL: tabel Customer Cluster
 *  (variant lama) hanya mengoper dua itu, jadi tombol lain otomatis
 *  tersembunyi di sana tanpa perlu mengubah halaman /cluster. */
export function CustomerBulkToolbar({
  selectedCount,
  onClear,
  onAddToTasks,
  onAddToGroup,
  onChangePic,
  onRemoveFromGroup,
  onDeactivate,
  onExportSelected,
}: {
  selectedCount: number;
  onClear: () => void;
  onAddToTasks: () => void;
  onAddToGroup?: () => void;
  onChangePic?: () => void;
  onRemoveFromGroup?: () => void;
  onDeactivate?: () => void;
  onExportSelected?: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-xs">
      <span className="font-medium">{selectedCount.toLocaleString("id-ID")} dipilih</span>
      {onAddToGroup ? (
        <Button size="sm" variant="outline" onClick={onAddToGroup}>
          <UsersRound className="h-3.5 w-3.5" /> Tambah ke Grup
        </Button>
      ) : null}
      {onChangePic ? (
        <Button size="sm" variant="outline" onClick={onChangePic}>
          <UserCog className="h-3.5 w-3.5" /> Ubah PIC
        </Button>
      ) : null}
      {onDeactivate ? (
        <Button size="sm" variant="outline" onClick={onDeactivate}>
          <Ban className="h-3.5 w-3.5" /> Nonaktifkan
        </Button>
      ) : null}
      {onRemoveFromGroup ? (
        <Button size="sm" variant="outline" onClick={onRemoveFromGroup}>
          <UserMinus className="h-3.5 w-3.5" /> Hapus dari Grup
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={onAddToTasks}>
        <Send className="h-3.5 w-3.5" /> Masukkan ke Pembagian Tugas
      </Button>
      {onExportSelected ? (
        <Button size="sm" variant="outline" onClick={onExportSelected}>
          <Download className="h-3.5 w-3.5" /> Export Terpilih
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Batalkan Pilihan
      </Button>
    </div>
  );
}
