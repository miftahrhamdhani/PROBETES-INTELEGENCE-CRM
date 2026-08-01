"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CrmUserOption } from "@/lib/workspace-types";

/** Dialog assign — dipakai untuk assign satu task maupun bulk assign, tinggal
 *  beda `onSubmit` yang dikirim pemanggil (assignTaskAction vs bulkAssignTasksAction). */
export function AssignTaskDialog({
  open,
  onOpenChange,
  picOptions,
  count,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picOptions: CrmUserOption[];
  /** Jumlah task yang akan di-assign — 1 untuk assign tunggal. */
  count: number;
  onSubmit: (input: { assignedTo: number; dueAt: string | null }) => Promise<void>;
}) {
  const [assignedTo, setAssignedTo] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setAssignedTo("");
      setDueAt("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignedTo) {
      setError("Pilih PIC terlebih dahulu");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ assignedTo: Number(assignedTo), dueAt: dueAt || null });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal assign task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Assign {count > 1 ? `${count} Task` : "Task"}</DialogTitle>
            <DialogDescription>Pilih PIC CRM yang akan menangani {count > 1 ? "task-task ini" : "task ini"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>PIC CRM *</Label>
              <select
                required
                className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">— Pilih PIC —</option>
                {picOptions.map((pic) => (
                  <option key={pic.id} value={pic.id}>
                    {pic.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Due Date (opsional)</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
