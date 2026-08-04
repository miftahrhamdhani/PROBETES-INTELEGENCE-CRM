"use client";

import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toolbar muncul saat ada baris yang dicentang — mirip TaskBulkToolbar
 *  (Workspace), satu aksi: masukkan seluruh customer terpilih ke Pembagian
 *  Tugas sebagai task Broadcast sekaligus. */
export function CustomerBulkToolbar({
  selectedCount,
  onClear,
  onAddToTasks,
}: {
  selectedCount: number;
  onClear: () => void;
  onAddToTasks: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-xs">
      <span className="font-medium">{selectedCount.toLocaleString("id-ID")} customer dipilih</span>
      <Button size="sm" variant="outline" onClick={onAddToTasks}>
        <Send className="h-3.5 w-3.5" /> Masukkan ke Pembagian Tugas
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Batal Pilih
      </Button>
    </div>
  );
}
