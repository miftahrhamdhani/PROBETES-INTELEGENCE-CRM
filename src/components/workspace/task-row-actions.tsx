"use client";

import { CircleCheck, Eye, MoreVertical, NotebookPen, RefreshCw, RotateCcw, Trash2, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canTransitionStatus } from "@/lib/workspace-contracts";
import type { WorkspaceTaskRow } from "@/lib/workspace-types";

export function TaskRowActions({
  task,
  onView,
  onAssign,
  onSetStatus,
  onComplete,
  onEditNotes,
  onDelete,
  trashMode = false,
  onRestore,
  onPermanentDelete,
}: {
  task: WorkspaceTaskRow;
  onView: (task: WorkspaceTaskRow) => void;
  onAssign: (task: WorkspaceTaskRow) => void;
  onSetStatus: (task: WorkspaceTaskRow) => void;
  onComplete: (task: WorkspaceTaskRow) => void;
  onEditNotes: (task: WorkspaceTaskRow) => void;
  onDelete: (task: WorkspaceTaskRow) => void;
  trashMode?: boolean;
  onRestore: (task: WorkspaceTaskRow) => void;
  onPermanentDelete: (task: WorkspaceTaskRow) => void;
}) {
  const canAssign = canTransitionStatus(task.status, "ASSIGNED") || task.status === "ASSIGNED";
  const canChangeStatus = (["UNASSIGNED", "IN_PROGRESS", "CANCELLED"] as const).some(
    (target) => target !== task.status && canTransitionStatus(task.status, target)
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Aksi untuk task ${task.customerName}`}
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="truncate normal-case text-foreground">{task.customerName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onView(task)}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Lihat Detail
        </DropdownMenuItem>
        {trashMode ? (
          <>
            <DropdownMenuItem onSelect={() => onRestore(task)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Pulihkan
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => onPermanentDelete(task)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Hapus Permanen
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled={!canAssign} onSelect={() => onAssign(task)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Assign PIC
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canChangeStatus} onSelect={() => onSetStatus(task)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Ubah Status
            </DropdownMenuItem>
            {task.status === "ASSIGNED" || task.status === "IN_PROGRESS" ? (
              <DropdownMenuItem onSelect={() => onComplete(task)}>
                <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Selesaikan Broadcast
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onEditNotes(task)}>
              <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
              {task.notes ? "Ubah Catatan" : "Tambah Catatan"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => onDelete(task)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Hapus dari Pembagian Tugas
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
