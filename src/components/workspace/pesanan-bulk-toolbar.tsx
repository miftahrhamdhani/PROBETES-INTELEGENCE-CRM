"use client";

import { ArrowRightLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PesananBulkToolbar({
  selectedCount,
  onClear,
  moveLabel,
  onRequestMove,
}: {
  selectedCount: number;
  onClear: () => void;
  /** Label aksi "Pindahkan" — beda per tab, lihat PesananRowMenu. */
  moveLabel: string;
  onRequestMove: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-xs">
      <span className="font-medium">{selectedCount.toLocaleString("id-ID")} pesanan dipilih</span>
      <Button size="sm" variant="outline" onClick={onRequestMove}>
        <ArrowRightLeft className="h-3.5 w-3.5" /> {moveLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Batal Pilih
      </Button>
    </div>
  );
}
