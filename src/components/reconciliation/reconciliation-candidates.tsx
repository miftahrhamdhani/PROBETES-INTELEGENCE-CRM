"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadReconciliationCandidatesAction, reviewReconciliationAction } from "@/app/reconciliation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";

type Candidate = Awaited<ReturnType<typeof loadReconciliationCandidatesAction>>[number];

/**
 * Review kandidat pencocokan laporan manual CRM <-> order official (§C.12).
 *
 * Pipeline import membuat baris `MATCH_CANDIDATE` setiap kali sebuah laporan
 * manual menyerupai order hasil import. Tanpa layar ini antreannya bertambah
 * tanpa pernah bisa diputuskan — dan laporan manual yang sebenarnya sudah
 * tercatat sebagai order official berisiko dihitung dua kali.
 *
 * Keputusan bersifat sekali jalan: server menolak kandidat yang statusnya sudah
 * bukan MATCH_CANDIDATE, jadi klik ganda / dua reviewer bersamaan tidak bisa
 * menerapkan keputusan dua kali.
 */
export function ReconciliationCandidates() {
  const router = useRouter();
  const [rows, setRows] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reasons, setReasons] = React.useState<Record<number, string>>({});
  const [busyId, setBusyId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadReconciliationCandidatesAction());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat kandidat");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function decide(row: Candidate, decision: "RECONCILED" | "REJECTED") {
    const reason = (reasons[row.id] ?? "").trim();
    if (reason.length < 3) {
      toast.error("Alasan keputusan wajib diisi — tersimpan di audit log");
      return;
    }
    setBusyId(row.id);
    try {
      await reviewReconciliationAction({ id: row.id, decision, reason });
      toast.success(decision === "RECONCILED" ? "Kandidat dicocokkan" : "Kandidat ditolak");
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan keputusan");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            Kandidat pencocokan manual ↔ official
            {rows.length > 0 ? <Badge variant="warning">{rows.length} menunggu</Badge> : null}
          </CardTitle>
          <CardDescription className="mt-1">
            Laporan manual CRM yang menyerupai order hasil import Database All. Cocokkan bila keduanya transaksi yang sama
            (order official tetap jadi sumber canonical), tolak bila berbeda.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Memuat kandidat...
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Tidak ada kandidat menunggu keputusan.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 text-xs">
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{row.customer_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Laporan {row.report_date} · {formatRupiah(row.total_payment)} · metode match: {row.match_method}
                </p>
              </div>
              <Input
                value={reasons[row.id] ?? ""}
                onChange={(event) => setReasons((prev) => ({ ...prev, [row.id]: event.target.value }))}
                placeholder="Alasan keputusan (wajib)"
                className="h-7 w-56 text-xs"
              />
              <Button type="button" size="sm" className="h-7 px-2" disabled={busyId === row.id} onClick={() => decide(row, "RECONCILED")}>
                {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : "Cocokkan"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={busyId === row.id}
                onClick={() => decide(row, "REJECTED")}
              >
                Tolak
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
