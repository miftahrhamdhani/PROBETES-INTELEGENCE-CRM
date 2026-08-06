"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bulkChangeWorkspacePesananStatusAction } from "@/app/workspace-pesanan-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_TARGET_LABELS, type WorkspaceOrderStatusChangeTarget } from "@/lib/workspace-pesanan-contracts";

/**
 * Konfirmasi ubah status massal — SATU instance dirender oleh PesananManager,
 * dipicu dari dua tempat (menu klik-kanan & bulk toolbar) supaya tidak ada dua
 * salinan dialog yang sama. `targets` datang dari MOVE_TARGETS_BY_TAB (lihat
 * workspace-pesanan-contracts.ts) — kalau cuma satu opsi (mis. tab Retur &
 * Refund -> cuma CONFIRMED), langsung dipakai tanpa perlu dropdown pilihan.
 */
export function PesananMoveDialog({
  ids,
  targets,
  onOpenChange,
  onMoved,
}: {
  ids: number[] | null;
  targets: WorkspaceOrderStatusChangeTarget[];
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const singleTarget = targets.length === 1 ? targets[0]! : null;
  const [target, setTarget] = React.useState<WorkspaceOrderStatusChangeTarget | "">(singleTarget ?? "");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!ids) {
      setTarget(singleTarget ?? "");
      setReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  async function handleMove() {
    if (!ids || !target) return;
    setBusy(true);
    try {
      const result = await bulkChangeWorkspacePesananStatusAction({ ids, target, reason: reason.trim() || undefined });
      if (result.succeeded.length > 0) toast.success(`${result.succeeded.length} pesanan diubah ke ${STATUS_TARGET_LABELS[target]}`);
      if (result.failed.length > 0) toast.error(`${result.failed.length} pesanan dilewati (status tidak eligible, atau sudah dihapus)`);
      onOpenChange(false);
      onMoved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah status pesanan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!ids} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah status {ids?.length ?? 0} pesanan?</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          {singleTarget === "CONFIRMED" ? (
            <p className="text-xs text-muted-foreground">
              Pesanan akan ditandai Confirmed lagi (mis. customer yang tadinya batal/retur/refund pesan lagi) dan
              otomatis pindah ke tab Semua Pesanan. Pesanan tanpa No Order/ID Pesanan atau yang gagal transisi dilewati.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Pesanan yang berhasil otomatis pindah tab sesuai status barunya. Pesanan yang tidak eligible (mis.
                masih DRAFT) dilewati.
              </p>
              {singleTarget == null ? (
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">Ubah ke</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value as WorkspaceOrderStatusChangeTarget)}
                    disabled={busy}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Pilih status tujuan</option>
                    {targets.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_TARGET_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
          <p className="text-[11px] font-medium">Catatan (opsional, berlaku untuk semua)</p>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Karena apa?" disabled={busy} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button type="button" size="sm" onClick={handleMove} disabled={busy || !target}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Terapkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
