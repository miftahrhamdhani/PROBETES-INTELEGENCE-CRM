"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createManualTasksBulkAction } from "@/app/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PendingBroadcastCustomer = { id: number; name: string; phone: string };

/**
 * "Masukkan ke Pembagian Tugas" — dipakai dari klik kanan satu customer maupun
 * multi-select (Customers & Customer Cluster). Task selalu tipe Broadcast
 * (fixed, bukan dropdown) karena itu tujuan eksplisit fitur ini: leader melihat
 * task UNASSIGNED baru di Pembagian Tugas dan membagikannya ke staff untuk
 * broadcast. Tidak ada langkah tersembunyi — customer TIDAK berubah, hanya
 * task baru yang tercatat.
 */
export function AddToPembagianTugasDialog({
  customers,
  onOpenChange,
  onDone,
}: {
  customers: PendingBroadcastCustomer[] | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (customers) {
      setNotes("");
      setDueAt("");
      setError(null);
      setResult(null);
    }
  }, [customers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customers?.length) return;
    setSaving(true);
    setError(null);
    try {
      const { created } = await createManualTasksBulkAction({
        customerIds: customers.map((c) => c.id),
        taskType: "BROADCAST",
        dueAt: dueAt || null,
        notes: notes.trim() || null,
      });
      setResult(created);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat task");
    } finally {
      setSaving(false);
    }
  }

  const preview = customers?.slice(0, 3) ?? [];
  const remaining = customers ? customers.length - preview.length : 0;

  return (
    <Dialog open={!!customers} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {result !== null ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" /> Task dibuat
              </DialogTitle>
              <DialogDescription>
                {result} task Broadcast berstatus <strong>Belum Dibagi</strong> — leader tinggal assign ke staff dari{" "}
                <Link href="/workspace/pembagian-tugas" className="text-primary underline">
                  Pembagian Tugas
                </Link>
                .
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Masukkan ke Pembagian Tugas</DialogTitle>
              <DialogDescription>
                Dibuat sebagai task <Badge variant="outline" className="mx-1">Broadcast</Badge> berstatus Belum Dibagi —
                leader yang memilih siapa yang menangani.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/40 p-2 text-xs">
                <p className="font-medium">{customers?.length ?? 0} customer dipilih</p>
                <p className="mt-0.5 text-muted-foreground">
                  {preview.map((c) => c.name).join(", ")}
                  {remaining > 0 ? ` +${remaining} lainnya` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Catatan (opsional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="mis. Broadcast promo Ebook 90"
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label>Due Date (opsional)</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={saving || !customers?.length}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Masukkan ke Pembagian Tugas
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
