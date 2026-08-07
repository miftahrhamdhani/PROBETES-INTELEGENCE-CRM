"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TaskMenuTarget = { taskId: number; customerName: string; x: number; y: number };

/**
 * Klik kanan/⋮ pada baris Pembagian Tugas — satu-satunya aksi: "Hapus dari
 * Pembagian Tugas". "Centang semua"/"Hapus centang" SENGAJA tidak diduplikasi
 * di sini karena checkbox header (SelectAllCheckbox) sudah menyediakan itu —
 * satu mekanisme, bukan dua cara berbeda untuk hal yang sama.
 *
 * "Hapus" menghapus task, bukan customer. Customer tetap tersedia di halaman
 * Customer dan dapat dimasukkan lagi ke Pembagian Tugas kapan saja.
 */
export function TaskRowMenu({
  target,
  onClose,
  onDelete,
}: {
  target: TaskMenuTarget | null;
  onClose: () => void;
  onDelete: (taskId: number) => void;
}) {
  const [confirmTarget, setConfirmTarget] = React.useState<TaskMenuTarget | null>(null);

  return (
    <>
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
              <DropdownMenuLabel className="truncate normal-case text-foreground">{target.customerName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  setConfirmTarget(target);
                  onClose();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Hapus dari Pembagian Tugas
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus task {confirmTarget?.customerName} dari Pembagian Tugas?</AlertDialogTitle>
            <AlertDialogDescription>
              Task dipindahkan ke Riwayat Hapus dan masih bisa dipulihkan. Data customer tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTarget) onDelete(confirmTarget.taskId);
                setConfirmTarget(null);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
