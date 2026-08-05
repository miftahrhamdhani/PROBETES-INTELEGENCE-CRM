"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { loadCustomerList } from "@/app/customers-actions";
import { createManualTaskAction } from "@/app/workspace-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MANUAL_CRM_TASK_TYPES, CRM_TASK_TYPE_LABELS, type ManualCrmTaskType } from "@/lib/workspace-contracts";

type CustomerOption = { id: number; name: string; phone: string };

/**
 * "+ Tambah Tugas" langsung dari halaman Pembagian Tugas — beda dari form
 * manual di Customer Detail Sheet (yang customer-nya sudah pasti) atau
 * "Masukkan ke Pembagian Tugas" dari Customers/Cluster (klik kanan/multi-select):
 * di sini belum tentu sedang melihat customer tertentu, jadi perlu pencarian
 * nama/No HP dulu sebelum bisa memilih jenis tugas.
 */
export function AddTaskDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<CustomerOption[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<CustomerOption | null>(null);
  const [taskType, setTaskType] = React.useState<ManualCrmTaskType>("BROADCAST");
  const [dueAt, setDueAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setOptions([]);
      setSelected(null);
      setTaskType("BROADCAST");
      setDueAt("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (selected || search.trim().length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const result = await loadCustomerList({ search: search.trim(), perPage: 8 });
        if (!cancelled) setOptions(result.rows.map((r) => ({ id: r.customerId, name: r.displayName, phone: r.normalizedPhone })));
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, selected]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await createManualTaskAction({
        customerId: selected.id,
        taskType,
        dueAt: dueAt || null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Tambah Tugas</DialogTitle>
            <DialogDescription>Cari customer, lalu tentukan jenis tugasnya. Task lahir Belum Dibagi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selected ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 p-2 text-xs">
                <div>
                  <p className="font-medium">{selected.name}</p>
                  <p className="tabular text-muted-foreground">{selected.phone}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Ganti
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Customer *</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau nomor HP…"
                    className="pl-8"
                    autoComplete="off"
                  />
                </div>
                {searching ? (
                  <p className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Mencari…
                  </p>
                ) : options.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    {options.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={cn("flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs hover:bg-accent")}
                        onClick={() => {
                          setSelected(c);
                          setSearch("");
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="tabular text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                ) : search.trim().length >= 2 ? (
                  <p className="py-1 text-[11px] text-muted-foreground">Tidak ada customer yang cocok.</p>
                ) : null}
              </div>
            )}

            <div className="space-y-1">
              <Label>Jenis Tugas *</Label>
              <select
                className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as ManualCrmTaskType)}
              >
                {MANUAL_CRM_TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CRM_TASK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Due Date (opsional)</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Catatan (opsional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving || !selected}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Tambah Tugas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
