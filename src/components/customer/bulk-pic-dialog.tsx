"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { applyBulkMembershipPatch } from "./bulk-membership-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { BulkTarget } from "./bulk-group-dialog";

/** "Ubah PIC" massal — HANYA picUserId yang berubah, status/groupName/notes
 *  customer dipertahankan (lihat applyBulkMembershipPatch). */
export function BulkPicDialog({
  customers,
  picOptions,
  onOpenChange,
  onDone,
}: {
  customers: BulkTarget[] | null;
  picOptions: { id: number; name: string }[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [picUserId, setPicUserId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ succeeded: number; failed: number } | null>(null);

  React.useEffect(() => {
    if (customers) {
      setPicUserId("");
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
      const { succeeded, failed } = await applyBulkMembershipPatch(
        customers.map((c) => c.id),
        { picUserId: picUserId ? Number(picUserId) : null }
      );
      setResult({ succeeded, failed: failed.length });
      if (failed.length === 0) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const preview = customers?.slice(0, 3) ?? [];
  const remaining = customers ? customers.length - preview.length : 0;
  const picName = picOptions.find((p) => String(p.id) === picUserId)?.name;

  return (
    <Dialog open={!!customers} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" /> Selesai
              </DialogTitle>
              <DialogDescription>
                PIC {result.succeeded} customer berhasil diubah{picName ? ` menjadi ${picName}` : ""}.
                {result.failed > 0 ? ` ${result.failed} gagal — coba ulangi dari menu per-baris.` : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ubah PIC</DialogTitle>
              <DialogDescription>Status grup dan nama grup customer terpilih tidak berubah — hanya PIC.</DialogDescription>
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
                <Label>PIC / CRM</Label>
                <select
                  className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                  value={picUserId}
                  onChange={(e) => setPicUserId(e.target.value)}
                >
                  <option value="">— Belum ditentukan —</option>
                  {picOptions.map((pic) => (
                    <option key={pic.id} value={pic.id}>{pic.name}</option>
                  ))}
                </select>
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
              <Button type="submit" size="sm" disabled={saving || !customers?.length}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
