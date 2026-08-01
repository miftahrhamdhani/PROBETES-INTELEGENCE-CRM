"use client";

import * as React from "react";
import { Loader2, UserPlus, X } from "lucide-react";
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
  if (selectedCount === 0) return null;

  async function handleStatus(status: (typeof BULK_STATUS_TARGETS)[number]) {
    setApplying(true);
    try {
      await onBulkStatus(status);
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
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Batal Pilih
      </Button>
    </div>
  );
}
