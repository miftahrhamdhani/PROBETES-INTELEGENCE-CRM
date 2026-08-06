"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  cancelWorkspaceCostAction,
  createWorkspaceCostAction,
  directorApproveWorkspaceCostAction,
  leaderVerifyWorkspaceCostAction,
  loadWorkspaceCostAction,
  rejectWorkspaceCostAction,
  requestRevisionWorkspaceCostAction,
  spvApproveWorkspaceCostAction,
  submitWorkspaceCostAction,
  updateWorkspaceCostDraftAction,
} from "@/app/workspace-cost-actions";
import { AuditLogList } from "@/components/workspace/audit-log-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  WORKSPACE_COST_CATEGORIES,
  WORKSPACE_COST_CATEGORY_LABEL,
  type WorkspaceCostBody,
  type WorkspaceCostDetail,
  type WorkspaceCostRow,
  type WorkspaceCostStatus,
} from "@/lib/workspace-cost-contracts";
import { canCreateCost, CANCELLABLE_STATUSES, nextApprovalStage, requiredApproverRole, resolveCostRole } from "@/lib/workspace-cost-workflow";
import { formatDate, formatRupiah } from "@/lib/format";

const STATUS_VARIANT: Record<WorkspaceCostStatus, "default" | "secondary" | "outline" | "warning" | "success"> = {
  DRAFT: "secondary",
  SUBMITTED: "outline",
  LEADER_VERIFIED: "outline",
  SPV_APPROVED: "outline",
  DIRECTOR_APPROVED: "success",
  REVISION_REQUESTED: "warning",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

type CurrentUser = { id: number; name: string; role: "ADMIN" | "CRM" | "MANAGEMENT" };

function emptyCostForm(): WorkspaceCostBody {
  return { costDate: new Date().toISOString().slice(0, 10), costName: "", amount: 0, category: "COM_LAINNYA", vendor: "", usagePeriod: "", paymentMethod: "", referenceNumber: "", proofUrl: "", notes: "" };
}

export function CostManager({ initialRows, currentUser }: { initialRows: WorkspaceCostRow[]; currentUser: CurrentUser }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const canCreate = currentUser.role === "ADMIN" || canCreateCost(resolveCostRole(currentUser.name));

  function refresh() {
    router.refresh();
  }

  const columns = React.useMemo<ColumnDef<WorkspaceCostRow, any>[]>(
    () => [
      { accessorKey: "costDate", header: "Tanggal", size: 100, cell: ({ getValue }) => formatDate(getValue()) },
      { accessorKey: "costName", header: "Nama Biaya", size: 220 },
      { accessorKey: "category", header: "Kategori", size: 140, cell: ({ getValue }) => WORKSPACE_COST_CATEGORY_LABEL[getValue() as keyof typeof WORKSPACE_COST_CATEGORY_LABEL] },
      { accessorKey: "vendor", header: "Vendor", size: 140, cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "amount", header: "Nominal", size: 130, cell: ({ getValue }) => <span className="tabular">{formatRupiah(getValue())}</span> },
      { accessorKey: "createdByName", header: "Dibuat Oleh", size: 150, cell: ({ getValue }) => getValue() ?? "—" },
      { accessorKey: "status", header: "Status", size: 150, cell: ({ getValue }) => <Badge variant={STATUS_VARIANT[getValue() as WorkspaceCostStatus]}>{getValue()}</Badge> },
      {
        id: "actions",
        header: "Aksi",
        size: 90,
        enableResizing: false,
        cell: ({ row }) => (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDetailId(row.original.id)}>
            Lihat
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{initialRows.length} biaya pada filter ini</p>
        {canCreate ? (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajukan Biaya
          </Button>
        ) : null}
      </div>

      <DataTable columns={columns} rows={initialRows} rowKey={(row) => row.id} loading={false} hasMore={false} onLoadMore={() => {}} height={520} onRowClick={(row) => setDetailId(row.id)} />

      <CostFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      <CostDetailDialog id={detailId} currentUser={currentUser} onClose={() => setDetailId(null)} onChanged={refresh} />
    </div>
  );
}

function CostFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: { id: number; body: WorkspaceCostBody };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<WorkspaceCostBody>(initial?.body ?? emptyCostForm());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setForm(initial?.body ?? emptyCostForm());
  }, [open, initial]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateWorkspaceCostDraftAction(initial.id, form);
      else await createWorkspaceCostAction(form);
      toast.success("Biaya Operasional berhasil disimpan");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan biaya");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Biaya Operasional" : "Ajukan Biaya Operasional"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tanggal Biaya" required>
              <Input type="date" value={form.costDate} onChange={(e) => setForm((f) => ({ ...f, costDate: e.target.value }))} />
            </Field>
            <Field label="Nominal" required>
              <Input type="number" min={1} value={form.amount || ""} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
            </Field>
          </div>
          <Field label="Nama Biaya" required>
            <Input value={form.costName} onChange={(e) => setForm((f) => ({ ...f, costName: e.target.value }))} placeholder="mis. Biaya Mekari Agustus" />
          </Field>
          <Field label="Kategori COM" required>
            <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as WorkspaceCostBody["category"] }))}>
              {WORKSPACE_COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>{WORKSPACE_COST_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vendor/Penyedia"><Input value={form.vendor ?? ""} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} /></Field>
            <Field label="Periode Penggunaan"><Input value={form.usagePeriod ?? ""} onChange={(e) => setForm((f) => ({ ...f, usagePeriod: e.target.value }))} placeholder="mis. Agustus 2026" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Metode Pembayaran"><Input value={form.paymentMethod ?? ""} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} /></Field>
            <Field label="Nomor Referensi"><Input value={form.referenceNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} /></Field>
          </div>
          <Field label="Bukti Pembayaran (URL)"><Input value={form.proofUrl ?? ""} onChange={(e) => setForm((f) => ({ ...f, proofUrl: e.target.value }))} placeholder="Tautan bukti pembayaran" /></Field>
          <Field label="Catatan"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Simpan Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CostDetailDialog({
  id,
  currentUser,
  onClose,
  onChanged,
}: {
  id: number | null;
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<WorkspaceCostDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [reasonDialog, setReasonDialog] = React.useState<"revision" | "reject" | null>(null);
  const [reason, setReason] = React.useState("");

  const load = React.useCallback(async () => {
    if (id == null) return;
    setLoading(true);
    try {
      setDetail(await loadWorkspaceCostAction(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    if (id != null) load();
    else setDetail(null);
  }, [id, load]);

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await load();
      onChanged();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Aksi gagal");
    } finally {
      setBusy(false);
    }
  }

  if (id == null) return null;

  const isCreator = detail?.createdBy === currentUser.id;
  const canEdit = Boolean(detail) && isCreator && (detail!.status === "DRAFT" || detail!.status === "REVISION_REQUESTED");
  const canCancel = Boolean(detail) && (isCreator || currentUser.role === "ADMIN") && (CANCELLABLE_STATUSES.includes(detail!.status) || (detail!.status === "DIRECTOR_APPROVED" && currentUser.role === "ADMIN"));

  const stage = detail ? nextApprovalStage(detail.status, resolveCostRole(detail.createdByName)) : null;
  const actorRole = resolveCostRole(currentUser.name);
  const canDecide = Boolean(detail) && stage != null && !isCreator && (actorRole === requiredApproverRole(stage!) || currentUser.role === "ADMIN");
  const stageLabel = stage === "LEADER_VERIFY" ? "Verifikasi Leader" : stage === "SPV_APPROVE" ? "Setujui SPV" : "Setujui Direktur";
  const decideAction = stage === "LEADER_VERIFY" ? leaderVerifyWorkspaceCostAction : stage === "SPV_APPROVE" ? spvApproveWorkspaceCostAction : directorApproveWorkspaceCostAction;

  return (
    <>
      <Dialog open={id != null} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.costName ?? "Detail Biaya"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {loading || !detail ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Memuat...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Info label="Tanggal" value={formatDate(detail.costDate)} />
                  <Info label="Nominal" value={formatRupiah(detail.amount)} />
                  <Info label="Kategori" value={WORKSPACE_COST_CATEGORY_LABEL[detail.category]} />
                  <Info label="Status" value={<Badge variant={STATUS_VARIANT[detail.status]}>{detail.status}</Badge>} />
                  <Info label="Vendor" value={detail.vendor ?? "—"} />
                  <Info label="Periode Penggunaan" value={detail.usagePeriod ?? "—"} />
                  <Info label="Dibuat Oleh" value={detail.createdByName ?? "—"} />
                  <Info label="Diajukan" value={detail.submittedAt ? formatDate(detail.submittedAt) : "—"} />
                  <Info label="Leader Verified" value={detail.leaderVerifiedByName ?? "—"} />
                  <Info label="SPV Approved" value={detail.spvApprovedByName ?? "—"} />
                  <Info label="Director Approved" value={detail.directorApprovedByName ?? "—"} />
                  {detail.revisionReason ? <Info label="Alasan Revisi" value={detail.revisionReason} /> : null}
                  {detail.rejectReason ? <Info label="Alasan Tolak" value={detail.rejectReason} /> : null}
                  {detail.notes ? <Info label="Catatan" value={detail.notes} /> : null}
                </div>

                <div className="flex flex-wrap gap-1.5 border-t pt-2">
                  {canEdit ? <Button type="button" size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>Edit Draft</Button> : null}
                  {canEdit ? (
                    <Button type="button" size="sm" onClick={() => run(() => submitWorkspaceCostAction(detail.id), "Biaya diajukan")} disabled={busy}>Ajukan</Button>
                  ) : null}
                  {canDecide ? (
                    <>
                      <Button type="button" size="sm" onClick={() => run(() => decideAction(detail.id), `${stageLabel} berhasil`)} disabled={busy}>{stageLabel}</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setReason(""); setReasonDialog("revision"); }} disabled={busy}>Minta Revisi</Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => { setReason(""); setReasonDialog("reject"); }} disabled={busy}>Tolak</Button>
                    </>
                  ) : null}
                  {canCancel ? (
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => cancelWorkspaceCostAction(detail.id), "Biaya dibatalkan")} disabled={busy}>Batalkan</Button>
                  ) : null}
                </div>
                <AuditLogList entityType="WORKSPACE_COST" entityId={detail.id} />
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {detail ? (
        <CostFormDialog
          open={editOpen}
          initial={{ id: detail.id, body: { costDate: detail.costDate, costName: detail.costName, amount: Number(detail.amount), category: detail.category, vendor: detail.vendor ?? "", usagePeriod: detail.usagePeriod ?? "", paymentMethod: detail.paymentMethod ?? "", referenceNumber: detail.referenceNumber ?? "", proofUrl: detail.proofUrl ?? "", notes: detail.notes ?? "" } }}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await load();
            onChanged();
          }}
        />
      ) : null}

      <Dialog open={reasonDialog != null} onOpenChange={(next) => !next && setReasonDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reasonDialog === "revision" ? "Minta Revisi" : "Tolak Biaya"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label="Alasan" required>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Jelaskan alasannya..." />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setReasonDialog(null)}>Batal</Button>
            <Button
              type="button"
              size="sm"
              variant={reasonDialog === "reject" ? "destructive" : "default"}
              disabled={!reason.trim() || busy}
              onClick={async () => {
                if (!detail) return;
                const currentReasonDialog = reasonDialog;
                setReasonDialog(null);
                await run(
                  () => (currentReasonDialog === "revision" ? requestRevisionWorkspaceCostAction(detail.id, { reason }) : rejectWorkspaceCostAction(detail.id, { reason })),
                  currentReasonDialog === "revision" ? "Revisi diminta" : "Biaya ditolak"
                );
              }}
            >
              Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
