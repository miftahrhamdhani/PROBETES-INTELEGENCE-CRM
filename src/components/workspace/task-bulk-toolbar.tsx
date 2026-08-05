"use client";

import * as React from "react";
import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BULK_STATUS_TARGETS, CRM_TASK_STATUS_LABELS } from "@/lib/workspace-contracts";

export function TaskBulkToolbar({
  selectedCount,
  onClear,
  onAssign,
  onBulkStatus,
}: {
  selectedCount: number;
  onClear: () => void;
  onAssign: () => void;
  onBulkStatus: (status: (typeof BULK_STATUS_TARGETS)[number]) => Promise<void>;
}) {
  const [applying, setApplying] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  if (selectedCount === 0) return null;

  async function handleStatus(status: (typeof BULK_STATUS_TARGETS)[number]) {
    setApplying(true);
    try {
      await onBulkStatus(status);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui status task");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-xs">
      <span className="font-medium">{selectedCount.toLocaleString("id-ID")} task dipilih</span>
      <Button size="sm" variant="outline" onClick={onAssign} disabled={applying}>
        <UserPlus className="h-3.5 w-3.5" /> Assign
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={applying}>
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Ubah Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {BULK_STATUS_TARGETS.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => handleStatus(status)}>
              {CRM_TASK_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Jalan pintas langsung "Ubah Status > Dibatalkan" — label eksplisit
          "Hapus" supaya sesuai istilah yang dipakai CRM, bukan cuma tersembunyi
          di dropdown Ubah Status. */}
      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)} disabled={applying}>
        <Trash2 className="h-3.5 w-3.5" /> Hapus dari Pembagian Tugas
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Batal Pilih
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedCount} task dari Pembagian Tugas?</AlertDialogTitle>
            <AlertDialogDescription>
              Task dibatalkan dan hilang dari daftar ini. Tidak dihapus permanen — tetap bisa dilihat dan dipulihkan
              lewat filter Status &quot;Dibatalkan&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                handleStatus("CANCELLED");
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
