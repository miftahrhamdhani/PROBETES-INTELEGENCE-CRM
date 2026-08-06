"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  assignTaskAction,
  cancelTaskAction,
  completeTaskAction,
  confirmJoinedGroupAction,
  loadReportsForCustomerAction,
  loadWorkspaceTaskDetail,
  setTaskStatusAction,
} from "@/app/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatRupiah } from "@/lib/format";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/membership-contracts";
import {
  CRM_TASK_OUTCOMES,
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPE_LABELS,
  type CrmTaskOutcome,
} from "@/lib/workspace-contracts";
import type { CrmUserOption, WorkspaceTaskDetail } from "@/lib/workspace-types";

function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "Belum ditentukan";
  return (CLUSTER_LABELS as Record<string, string>)[code] ?? (NON_CLUSTER_LABELS as Record<string, string>)[code] ?? code;
}

export function TaskDetailSheet({ picOptions, onChanged }: { picOptions: CrmUserOption[]; onChanged?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskIdRaw = searchParams.get("task");
  const taskId = taskIdRaw ? Number(taskIdRaw) : null;

  const [detail, setDetail] = React.useState<WorkspaceTaskDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const fetchDetail = React.useCallback(async (id: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await loadWorkspaceTaskDetail(id);
      if (requestId !== requestIdRef.current) return result;
      setDetail(result);
      if (!result) setLoadError("Task tidak ditemukan");
      return result;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setDetail(null);
        setLoadError(error instanceof Error ? error.message : "Gagal memuat detail task");
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!taskId) {
      requestIdRef.current += 1;
      setDetail(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setDetail(null);
    void fetchDetail(taskId);
  }, [taskId, fetchDetail]);

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const query = params.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  }

  function refresh() {
    if (taskId) fetchDetail(taskId);
    onChanged?.();
    router.refresh();
  }

  return (
    <Sheet open={!!taskId} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        {loading ? (
          <DetailSkeleton />
        ) : loadError ? (
          <div className="p-5 text-sm text-destructive">{loadError}</div>
        ) : detail ? (
          <TaskDetailBody detail={detail} picOptions={picOptions} onChanged={refresh} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({
  detail,
  picOptions,
  onChanged,
}: {
  detail: WorkspaceTaskDetail;
  picOptions: CrmUserOption[];
  onChanged: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{detail.customerName}</SheetTitle>
        <SheetDescription>{detail.customerPhone}</SheetDescription>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge>{CRM_TASK_TYPE_LABELS[detail.taskType]}</Badge>
          <Badge variant="outline">{clusterLabel(detail.clusterCode)}</Badge>
          {detail.overdue ? <Badge variant="warning">Overdue</Badge> : null}
        </div>
      </SheetHeader>

      <SheetBody className="space-y-5">
        <section className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Produk Pertama" value={detail.firstProductName ?? "—"} />
          <Field label="Status Grup" value={MEMBERSHIP_STATUS_LABELS[detail.membershipStatus]} />
          <Field label="Customer Sejak" value={formatDate(detail.firstOrderDate ?? detail.createdAt)} />
          <Field label="Terdeteksi" value={formatDate(detail.createdAt)} />
        </section>

        <AssignSection detail={detail} picOptions={picOptions} onChanged={onChanged} />
        <StatusActions detail={detail} onChanged={onChanged} />

        {detail.linkedReport ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laporan CRM Tertaut</h3>
            <div className="rounded-md border p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatDate(detail.linkedReport.reportDate)}</span>
                <span className="font-semibold tabular">{formatRupiah(detail.linkedReport.totalPayment)}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{detail.linkedReport.itemsSummary}</p>
            </div>
          </section>
        ) : null}

        <section>
          <Link href={`/customers?customer=${detail.customerId}`} className="text-xs text-primary hover:underline">
            Lihat detail lengkap customer →
          </Link>
        </section>

        {detail.history.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Riwayat Perubahan</h3>
            <div className="space-y-1 text-xs">
              {detail.history.map((h) => (
                <div key={h.id} className="rounded-md border px-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {h.fromStatus ? `${CRM_TASK_STATUS_LABELS[h.fromStatus]} → ` : ""}
                      {CRM_TASK_STATUS_LABELS[h.toStatus]}
                    </span>
                    <span className="text-muted-foreground">{formatDate(h.changedAt.slice(0, 10))}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[h.note, h.changedByName].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </SheetBody>
    </>
  );
}

function AssignSection({
  detail,
  picOptions,
  onChanged,
}: {
  detail: WorkspaceTaskDetail;
  picOptions: CrmUserOption[];
  onChanged: () => void;
}) {
  const [picUserId, setPicUserId] = React.useState(detail.picUserId ? String(detail.picUserId) : "");
  const [dueAt, setDueAt] = React.useState(detail.dueAt ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const disabled = detail.status === "DONE" || detail.status === "CANCELLED";

  React.useEffect(() => {
    setPicUserId(detail.picUserId ? String(detail.picUserId) : "");
    setDueAt(detail.dueAt ?? "");
  }, [detail.id, detail.picUserId, detail.dueAt]);

  async function handleSave() {
    if (!picUserId) {
      setError("Pilih PIC terlebih dahulu");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await assignTaskAction(detail.id, { assignedTo: Number(picUserId), dueAt: dueAt || null });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal assign task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment</h3>
      <div className="space-y-2 rounded-md border p-3">
        <div className="space-y-1">
          <Label className="text-[10px]">PIC CRM</Label>
          <select
            disabled={disabled}
            className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            value={picUserId}
            onChange={(e) => setPicUserId(e.target.value)}
          >
            <option value="">— Belum ditentukan —</option>
            {picOptions.map((pic) => (
              <option key={pic.id} value={pic.id}>
                {pic.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Due Date</Label>
          <Input type="date" disabled={disabled} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            {detail.assignedAt ? `Di-assign ${formatDate(detail.assignedAt.slice(0, 10))} oleh ${detail.assignedByName ?? "—"}` : "Belum pernah di-assign"}
          </p>
          <Button size="sm" onClick={handleSave} disabled={saving || disabled}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Simpan
          </Button>
        </div>
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}

function StatusActions({ detail, onChanged }: { detail: WorkspaceTaskDetail; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui task");
    } finally {
      setBusy(false);
    }
  }

  if (detail.status === "DONE") {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hasil</h3>
        <div className="rounded-md border p-3 text-xs">
          <p>
            Selesai {formatDate(detail.completedAt?.slice(0, 10) ?? null)} oleh {detail.completedByName ?? "—"}
          </p>
          {detail.outcome ? (
            <p className="mt-1">
              Outcome: <span className="font-medium">{CRM_TASK_OUTCOME_LABELS[detail.outcome]}</span>
            </p>
          ) : null}
          {detail.notes ? <p className="mt-1 text-muted-foreground">{detail.notes}</p> : null}
        </div>
        {detail.outcome === "JOINED_GROUP" && detail.membershipStatus !== "GROUPED" ? (
          <JoinedGroupConfirm taskId={detail.id} onChanged={onChanged} />
        ) : null}
        {detail.outcome === "CLOSING" ? (
          <Button size="sm" variant="outline" className="mt-2 w-full" asChild>
            <Link
              href={`/workspace/pesanan/baru?taskId=${detail.id}&customerName=${encodeURIComponent(detail.customerName)}&phone=${encodeURIComponent(detail.customerPhone)}`}
            >
              Buat Pesanan dari Closing ini →
            </Link>
          </Button>
        ) : null}
      </section>
    );
  }

  if (detail.status === "CANCELLED") {
    return (
      <section>
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Task dibatalkan.</div>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          disabled={busy}
          onClick={() => run(() => setTaskStatusAction(detail.id, { status: "UNASSIGNED" }))}
        >
          Aktifkan Kembali
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</h3>
      <div className="flex flex-wrap gap-2">
        {detail.status === "ASSIGNED" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setTaskStatusAction(detail.id, { status: "IN_PROGRESS" }))}>
            Mulai Kerjakan
          </Button>
        ) : null}
        {detail.status === "IN_PROGRESS" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setTaskStatusAction(detail.id, { status: "ASSIGNED" }))}>
            Kembalikan ke Assigned
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={() => run(() => cancelTaskAction(detail.id))}
        >
          Batalkan Task
        </Button>
      </div>
      {(detail.status === "ASSIGNED" || detail.status === "IN_PROGRESS") ? (
        <CompleteTaskForm taskId={detail.id} customerId={detail.customerId} onChanged={onChanged} />
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}

function CompleteTaskForm({ taskId, customerId, onChanged }: { taskId: number; customerId: number; onChanged: () => void }) {
  const [outcome, setOutcome] = React.useState<CrmTaskOutcome | "">("");
  const [notes, setNotes] = React.useState("");
  const [reports, setReports] = React.useState<{ id: number; reportDate: string; totalPayment: string; itemsSummary: string; linked: boolean }[]>([]);
  const [linkedReportId, setLinkedReportId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (outcome === "CLOSING" && reports.length === 0) {
      loadReportsForCustomerAction(customerId).then(setReports).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) {
      setError("Pilih outcome terlebih dahulu");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completeTaskAction(taskId, {
        outcome,
        notes: notes.trim() || null,
        linkedReportId: linkedReportId ? Number(linkedReportId) : null,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyelesaikan task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleComplete} className="space-y-2 rounded-md border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Selesaikan Tugas</p>
      <div className="space-y-1">
        <Label className="text-[10px]">Outcome *</Label>
        <select
          required
          className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as CrmTaskOutcome)}
        >
          <option value="">— Pilih outcome —</option>
          {CRM_TASK_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {CRM_TASK_OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Catatan</Label>
        <textarea
          className="min-h-16 w-full rounded-md border bg-card px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opsional"
        />
      </div>
      {outcome === "CLOSING" && reports.length > 0 ? (
        <div className="space-y-1">
          <Label className="text-[10px]">Tautkan ke Laporan CRM (opsional)</Label>
          <select
            className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
            value={linkedReportId}
            onChange={(e) => setLinkedReportId(e.target.value)}
          >
            <option value="">— Tidak ditautkan —</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id} disabled={r.linked}>
                {formatDate(r.reportDate)} · {formatRupiah(r.totalPayment)}
                {r.linked ? " (sudah tertaut task lain)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        Selesaikan Tugas
      </Button>
    </form>
  );
}

function JoinedGroupConfirm({ taskId, onChanged }: { taskId: number; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [groupName, setGroupName] = React.useState("");
  const [joinedAt, setJoinedAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await confirmJoinedGroupAction(taskId, { groupName: groupName || null, joinedAt: joinedAt || null });
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update membership");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Konfirmasi Update Group Membership → GROUPED
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border p-3">
      <p className="text-[11px] text-muted-foreground">Group Membership customer ini akan diubah menjadi GROUPED dan cluster dihitung ulang.</p>
      <div className="space-y-1">
        <Label className="text-[10px]">Nama Grup</Label>
        <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Tanggal Masuk</Label>
        <Input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Batal
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Konfirmasi
        </Button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-2 border-b px-5 py-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="space-y-5 px-5 py-4">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
