"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bulkCompleteTasksAction, completeTaskAction, updateTaskNotesAction } from "@/app/workspace-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CRM_TASK_OUTCOMES, CRM_TASK_OUTCOME_LABELS, type CrmTaskOutcome } from "@/lib/workspace-contracts";
import type { WorkspaceTaskRow } from "@/lib/workspace-types";

/**
 * "Selesaikan Broadcast" — memindahkan task dari tab Broadcast ke Completed.
 * Memakai `completeTaskAction` yang sudah ada, jadi aturan bisnisnya TIDAK
 * berubah: outcome WAJIB dipilih (dasar KPI Closing & konfirmasi Masuk Grup),
 * dan DONE tetap hanya bisa dicapai lewat jalur ini — bukan lewat set-status
 * generik.
 */
export function CompleteBroadcastDialog({
  task,
  bulkTaskIds,
  onOpenChange,
  onDone,
}: {
  /** Mode satuan — dari menu ⋮ baris. */
  task: WorkspaceTaskRow | null;
  /** Mode massal — dari "Ubah Status > Selesai (Completed)". Satu outcome
   *  dipakai untuk seluruh task terpilih. */
  bulkTaskIds?: number[] | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const isBulk = !!bulkTaskIds?.length;
  const open = task !== null || isBulk;
  const [outcome, setOutcome] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOutcome("");
    setNotes(isBulk ? "" : task?.notes ?? "");
    setError(null);
  }, [task, isBulk]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    setSaving(true);
    setError(null);
    try {
      if (isBulk) {
        const result = await bulkCompleteTasksAction({
          taskIds: bulkTaskIds,
          outcome: outcome as CrmTaskOutcome,
          notes: notes.trim() || null,
        });
        if (result.skipped > 0) {
          toast.warning(`${result.updated} task selesai, ${result.skipped} dilewati (belum punya PIC atau sudah selesai).`);
        } else {
          toast.success(`${result.updated} task dipindahkan ke Completed.`);
        }
      } else if (task) {
        await completeTaskAction(task.id, { outcome: outcome as CrmTaskOutcome, notes: notes.trim() || null });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyelesaikan broadcast");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Selesaikan Broadcast{isBulk ? ` (${bulkTaskIds!.length} task)` : ""}</DialogTitle>
            <DialogDescription>
              {isBulk ? "Task terpilih" : task ? `${task.customerName} — task` : "Task"} akan pindah ke tab Completed.
              Outcome wajib diisi karena dipakai KPI Closing dan konfirmasi Masuk Grup.
              {isBulk ? " Task yang belum punya PIC akan dilewati." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1">
              <Label>Outcome *</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger aria-label="Outcome">
                  <SelectValue placeholder="Pilih hasil broadcast" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_TASK_OUTCOMES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CRM_TASK_OUTCOME_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Catatan (opsional)</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="mis. masih negosiasi harga, minta follow-up minggu depan…"
              />
              <p className="text-[11px] text-muted-foreground">Catatan masih bisa diubah kapan saja di tab Completed.</p>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving || !outcome}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Selesaikan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edit catatan customer — dipakai di tab Completed karena situasinya memang
 * berkembang setelah broadcast ("masih negosiasi" -> "sudah dibayar").
 * Hanya menyentuh kolom `notes`; status/outcome/PIC tidak ikut berubah.
 */
export function EditNotesDialog({
  task,
  onOpenChange,
  onDone,
}: {
  task: WorkspaceTaskRow | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNotes(task?.notes ?? "");
    setError(null);
  }, [task]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await updateTaskNotesAction(task.id, { notes: notes.trim() || null });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan catatan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Catatan Customer</DialogTitle>
            <DialogDescription>
              {task ? `${task.customerName} — ` : ""}catat perkembangan terakhir, mis. masih negosiasi atau sudah
              dibayar. Status dan outcome task tidak ikut berubah.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ketik catatan di sini…"
              autoFocus
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Simpan Catatan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
