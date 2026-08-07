"use client";

import * as React from "react";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelWorkspaceCostAction,
  directorApproveWorkspaceCostAction,
  leaderVerifyWorkspaceCostAction,
  loadWorkspaceCostAction,
  rejectWorkspaceCostAction,
  requestRevisionWorkspaceCostAction,
  spvApproveWorkspaceCostAction,
  submitWorkspaceCostAction,
} from "@/app/workspace-cost-actions";
import { AuditLogList } from "@/components/workspace/audit-log-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatRupiah } from "@/lib/format";
import { WORKSPACE_COST_CATEGORY_LABEL, WORKSPACE_COST_STATUS_LABEL, type WorkspaceCostDetail, type WorkspaceCostRow } from "@/lib/workspace-cost-contracts";
import { nextApprovalStage, resolveCostRole } from "@/lib/workspace-cost-workflow";
import { cn } from "@/lib/utils";
import type { CostPermissions } from "./cost-page-client";
import { CATEGORY_TONE, computeCostAvailableActions, CREATOR_ROLE_LABEL, type CurrentUser, STATUS_TONE } from "./cost-shared";

export function CostDetailSheet({
  id,
  currentUser,
  permissions,
  onClose,
  onChanged,
  onEdit,
}: {
  id: number | null;
  currentUser: CurrentUser;
  permissions: CostPermissions;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (row: WorkspaceCostRow) => void;
}) {
  const [detail, setDetail] = React.useState<WorkspaceCostDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reasonDialog, setReasonDialog] = React.useState<"revision" | "reject" | "cancel" | null>(null);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aksi gagal");
    } finally {
      setBusy(false);
    }
  }

  if (id == null) return null;

  const actions = detail ? computeCostAvailableActions(detail, currentUser, permissions) : null;
  const stageLabel = actions?.stage === "LEADER_VERIFY" ? "Verifikasi sebagai Leader" : actions?.stage === "SPV_APPROVE" ? "Setujui sebagai SPV" : "Setujui sebagai Direktur";
  const decideAction =
    actions?.stage === "LEADER_VERIFY" ? leaderVerifyWorkspaceCostAction : actions?.stage === "SPV_APPROVE" ? spvApproveWorkspaceCostAction : directorApproveWorkspaceCostAction;

  return (
    <>
      <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail?.costName ?? "Detail Biaya"}</SheetTitle>
            <SheetDescription>{detail ? formatRupiah(detail.amount) : "Memuat..."}</SheetDescription>
            {detail ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={CATEGORY_TONE[detail.category]}>{WORKSPACE_COST_CATEGORY_LABEL[detail.category]}</Badge>
                <Badge variant="outline" className={STATUS_TONE[detail.status]}>{WORKSPACE_COST_STATUS_LABEL[detail.status]}</Badge>
              </div>
            ) : null}
          </SheetHeader>
          <SheetBody>
            {loading || !detail ? (
              <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">Ringkasan</TabsTrigger>
                  <TabsTrigger value="approval">Persetujuan</TabsTrigger>
                  <TabsTrigger value="audit">Audit History</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-xs">
                    <Detail label="Tanggal Biaya" value={formatDate(detail.costDate)} />
                    <Detail label="Nominal" value={formatRupiah(detail.amount)} />
                    <Detail label="Kategori" value={WORKSPACE_COST_CATEGORY_LABEL[detail.category]} />
                    <Detail label="Vendor" value={detail.vendor ?? "—"} />
                    <Detail label="Periode Penggunaan" value={detail.usagePeriod ?? "—"} />
                    <Detail label="Metode Pembayaran" value={detail.paymentMethod ?? "—"} />
                    <Detail label="Nomor Referensi" value={detail.referenceNumber ?? "—"} />
                    <Detail
                      label="Bukti Pembayaran"
                      value={
                        detail.proofUrl ? (
                          <a href={detail.proofUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Lihat Bukti <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <Detail label="Dibuat Oleh" value={`${detail.createdByName ?? "—"}${CREATOR_ROLE_LABEL[resolveCostRole(detail.createdByName)] ? ` — ${CREATOR_ROLE_LABEL[resolveCostRole(detail.createdByName)]}` : ""}`} />
                    <Detail label="Status" value={WORKSPACE_COST_STATUS_LABEL[detail.status]} />
                    <Detail label="Catatan" value={detail.notes ?? "—"} className="col-span-2" />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {actions?.canEdit ? <Button type="button" size="sm" variant="outline" onClick={() => onEdit(detail)} disabled={busy}>Edit Draft</Button> : null}
                    {actions?.canSubmit ? <Button type="button" size="sm" onClick={() => run(() => submitWorkspaceCostAction(detail.id), "Biaya diajukan")} disabled={busy}>Ajukan</Button> : null}
                    {actions?.canDecide ? <Button type="button" size="sm" onClick={() => run(() => decideAction(detail.id), `${stageLabel} berhasil`)} disabled={busy}>{stageLabel}</Button> : null}
                    {actions?.canRequestRevision ? <Button type="button" size="sm" variant="outline" onClick={() => { setReason(""); setReasonDialog("revision"); }} disabled={busy}>Minta Revisi</Button> : null}
                    {actions?.canReject ? <Button type="button" size="sm" variant="destructive" onClick={() => { setReason(""); setReasonDialog("reject"); }} disabled={busy}>Tolak</Button> : null}
                    {actions?.canCancel ? <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { setReason(""); setReasonDialog("cancel"); }} disabled={busy}>Batalkan</Button> : null}
                  </div>
                </TabsContent>

                <TabsContent value="approval">
                  <ApprovalTimeline detail={detail} />
                </TabsContent>

                <TabsContent value="audit">
                  {permissions.auditRead ? <AuditLogList entityType="WORKSPACE_COST" entityId={detail.id} /> : <Empty text="Permission audit history diperlukan." />}
                </TabsContent>
              </Tabs>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Dialog open={reasonDialog != null} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reasonDialog === "revision" ? "Minta Revisi" : reasonDialog === "reject" ? "Tolak Biaya" : "Batalkan Biaya"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Label className="text-xs">
              Alasan {reasonDialog === "cancel" ? "(opsional)" : <span className="text-destructive">*</span>}
            </Label>
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasannya..." />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setReasonDialog(null)}>Batal</Button>
            <Button
              type="button"
              size="sm"
              variant={reasonDialog === "reject" || reasonDialog === "cancel" ? "destructive" : "default"}
              disabled={busy || (reasonDialog !== "cancel" && !reason.trim())}
              onClick={async () => {
                if (!detail) return;
                const currentDialog = reasonDialog;
                setReasonDialog(null);
                if (currentDialog === "revision") await run(() => requestRevisionWorkspaceCostAction(detail.id, { reason }), "Revisi diminta");
                else if (currentDialog === "reject") await run(() => rejectWorkspaceCostAction(detail.id, { reason }), "Biaya ditolak");
                else if (currentDialog === "cancel") await run(() => cancelWorkspaceCostAction(detail.id, { reason: reason || null }), "Biaya dibatalkan");
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

type TimelineStep = {
  label: string;
  actorName: string | null;
  actorRole: string | null;
  at: string | null;
  note: string | null;
  state: "done" | "current" | "pending" | "rejected";
};

function ApprovalTimeline({ detail }: { detail: WorkspaceCostDetail }) {
  const creatorRole = CREATOR_ROLE_LABEL[resolveCostRole(detail.createdByName)];
  const steps: TimelineStep[] = [
    { label: "Dibuat", actorName: detail.createdByName, actorRole: creatorRole, at: detail.createdAt, note: null, state: "done" },
  ];

  if (detail.status === "CANCELLED") {
    steps.push({ label: "Dibatalkan", actorName: null, actorRole: null, at: detail.cancelledAt, note: null, state: "rejected" });
    return <TimelineList steps={steps} />;
  }

  if (!detail.submittedAt) {
    steps.push({ label: detail.status === "REVISION_REQUESTED" ? "Menunggu diajukan ulang" : "Belum diajukan", actorName: null, actorRole: null, at: null, note: null, state: "pending" });
    return <TimelineList steps={steps} />;
  }

  steps.push({ label: "Diajukan", actorName: detail.createdByName, actorRole: creatorRole, at: detail.submittedAt, note: null, state: "done" });

  const stageDefs: { key: "leader" | "spv" | "director"; label: string; byName: string | null; at: string | null }[] = [
    { key: "leader", label: "Diverifikasi Leader", byName: detail.leaderVerifiedByName, at: detail.leaderVerifiedAt },
    { key: "spv", label: "Disetujui SPV", byName: detail.spvApprovedByName, at: detail.spvApprovedAt },
    { key: "director", label: "Disetujui Direktur", byName: detail.directorApprovedByName, at: detail.directorApprovedAt },
  ];
  // Tahap yang dilewati (creator = role tahap itu sendiri) tidak ditampilkan —
  // sama seperti aturan nextApprovalStage di workspace-cost-workflow.ts.
  const creatorActorRole = resolveCostRole(detail.createdByName);
  const skip = { leader: creatorActorRole === "LEADER", spv: creatorActorRole === "SPV", director: false } as const;

  for (const stageDef of stageDefs) {
    if (skip[stageDef.key]) continue;
    if (stageDef.at) {
      steps.push({ label: stageDef.label, actorName: stageDef.byName, actorRole: null, at: stageDef.at, note: null, state: "done" });
    }
  }

  if (detail.status === "REVISION_REQUESTED") {
    steps.push({ label: "Perlu Revisi", actorName: null, actorRole: null, at: detail.updatedAt, note: detail.revisionReason, state: "rejected" });
  } else if (detail.status === "REJECTED") {
    steps.push({ label: "Ditolak", actorName: null, actorRole: null, at: detail.updatedAt, note: detail.rejectReason, state: "rejected" });
  } else if (detail.status !== "DIRECTOR_APPROVED") {
    // Sumber kebenaran tahap berikutnya SELALU nextApprovalStage (sama fungsi
    // yang dipakai server memvalidasi siapa boleh approve) — bukan re-derivasi
    // manual, supaya label timeline tidak pernah menyimpang dari aturan asli.
    const stage = nextApprovalStage(detail.status, creatorActorRole);
    const nextLabel = stage === "LEADER_VERIFY" ? "Menunggu Verifikasi Leader" : stage === "SPV_APPROVE" ? "Menunggu Persetujuan SPV" : "Menunggu Persetujuan Direktur";
    steps.push({ label: nextLabel, actorName: null, actorRole: null, at: null, note: null, state: "current" });
  }

  return <TimelineList steps={steps} />;
}

function TimelineList({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <span className="flex flex-col items-center">
            <StepIcon state={step.state} />
            {index < steps.length - 1 ? <span className="mt-1 h-full w-px flex-1 bg-slate-200" /> : null}
          </span>
          <div className="pb-4 text-xs">
            <p className={cn("font-semibold", step.state === "rejected" && "text-destructive", step.state === "current" && "text-amber-700")}>{step.label}</p>
            {step.actorName ? <p className="text-slate-600">{step.actorName}{step.actorRole ? ` — ${step.actorRole}` : ""}</p> : null}
            {step.at ? <p className="text-slate-400">{formatDateTime(step.at)}</p> : null}
            {step.note ? <p className="mt-1 rounded-md bg-slate-50 p-2 text-slate-600">{step.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: TimelineStep["state"] }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  if (state === "rejected") return <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" />;
  return <CircleDashed className={cn("h-4 w-4", state === "current" ? "text-amber-600" : "text-slate-300")} aria-hidden="true" />;
}

function Detail({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">{text}</p>;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
}
