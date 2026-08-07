"use client";

import * as React from "react";
import { BriefcaseBusiness, CircleCheck, Loader2, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BULK_STATUS_TARGETS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPE_LABELS,
  MANUAL_CRM_TASK_TYPES,
  type ManualCrmTaskType,
} from "@/lib/workspace-contracts";

/**
 * Bar aksi massal — muncul tepat di atas tabel begitu ada baris tercentang.
 * Memusatkan aksi massal: PIC, jenis tugas, status, selesai, dan hapus.
 */
export function TaskBulkToolbar({
  selectedCount,
  onClear,
  onAssign,
  onBulkTaskType,
  onBulkStatus,
  onBulkComplete,
  onDelete,
  trashMode = false,
  onRestore,
  onPermanentDelete,
}: {
  selectedCount: number;
  onClear: () => void;
  onAssign: () => void;
  onBulkTaskType: (taskType: ManualCrmTaskType) => Promise<void>;
  onBulkStatus: (status: (typeof BULK_STATUS_TARGETS)[number]) => Promise<void>;
  /** "Completed" tidak bisa langsung di-apply seperti status lain karena
   *  outcome WAJIB — jadi ini membuka dialog outcome, bukan mengeksekusi. */
  onBulkComplete: () => void;
  onDelete: () => Promise<void>;
  trashMode?: boolean;
  onRestore: () => Promise<void>;
  onPermanentDelete: () => Promise<void>;
}) {
  const [applying, setApplying] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = React.useState(false);
  if (selectedCount === 0) return null;

  async function apply(action: () => Promise<void>, fallback: string) {
    setApplying(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
    } finally {
      setApplying(false);
    }
  }

  function handleStatus(status: (typeof BULK_STATUS_TARGETS)[number]) {
    return apply(() => onBulkStatus(status), "Gagal memperbarui status task");
  }

  function handleTaskType(taskType: ManualCrmTaskType) {
    return apply(() => onBulkTaskType(taskType), "Gagal memperbarui jenis tugas");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-blue-50/70 px-4 py-2.5 text-xs dark:bg-blue-950/30">
      <span className="font-medium">{selectedCount.toLocaleString("id-ID")} tugas dipilih</span>
      {trashMode ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 bg-card"
            disabled={applying}
            onClick={() => apply(onRestore, "Gagal memulihkan task")}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Pulihkan
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 bg-card text-destructive"
            disabled={applying}
            onClick={() => setConfirmPermanentDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Hapus Permanen
          </Button>
        </>
      ) : (
        <>
      <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" onClick={onAssign} disabled={applying}>
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Pilih PIC
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" disabled={applying}>
            <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" /> Jenis Tugas
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {MANUAL_CRM_TASK_TYPES.map((taskType) => (
            <DropdownMenuItem key={taskType} onSelect={() => handleTaskType(taskType)}>
              {CRM_TASK_TYPE_LABELS[taskType]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" disabled={applying}>
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Ubah Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {BULK_STATUS_TARGETS.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => handleStatus(status)}>
              {CRM_TASK_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* Selesai/DONE dipisah karena satu-satunya status yang butuh input
              tambahan (outcome). Memilihnya membuka dialog, bukan langsung
              mengubah — aturan "DONE wajib outcome" tetap berlaku. */}
          <DropdownMenuItem onSelect={onBulkComplete}>
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {CRM_TASK_STATUS_LABELS.DONE} (Completed)…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" onClick={() => setConfirmDelete(true)} disabled={applying}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Hapus dari Pembagian Tugas
      </Button>
        </>
      )}
      <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1.5" onClick={onClear}>
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Batalkan Pilihan
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedCount} task dari Pembagian Tugas?</AlertDialogTitle>
            <AlertDialogDescription>
              Task dipindahkan ke Riwayat Hapus dan masih bisa dipulihkan. Data customer tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                apply(onDelete, "Gagal menghapus task");
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPermanentDelete} onOpenChange={setConfirmPermanentDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus permanen {selectedCount} task?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Hanya record task dan riwayat kerjanya yang dihapus; data customer tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmPermanentDelete(false);
                apply(onPermanentDelete, "Gagal menghapus task permanen");
              }}
            >
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
