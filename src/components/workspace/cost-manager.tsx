"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cancelWorkspaceCostAction, createWorkspaceCostAction, submitWorkspaceCostAction, updateWorkspaceCostDraftAction } from "@/app/workspace-cost-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatRupiah } from "@/lib/format";
import {
  WORKSPACE_COST_CATEGORIES,
  WORKSPACE_COST_CATEGORY_LABEL,
  WORKSPACE_COST_STATUS_LABEL,
  type WorkspaceCostBody,
  type WorkspaceCostCategory,
  type WorkspaceCostRow,
} from "@/lib/workspace-cost-contracts";
import { resolveCostRole } from "@/lib/workspace-cost-workflow";
import { cn } from "@/lib/utils";
import { CostDetailSheet } from "./cost-detail-sheet";
import type { CostPermissions } from "./cost-page-client";
import { CATEGORY_TONE, computeCostAvailableActions, CREATOR_ROLE_LABEL, type CurrentUser, STATUS_TONE } from "./cost-shared";

const COLUMN_LABELS = {
  category: "Kategori",
  vendor: "Vendor/Penyedia",
  usagePeriod: "Periode Penggunaan",
  paymentMethod: "Metode Pembayaran",
  referenceNumber: "Nomor Referensi",
  createdByName: "Dibuat Oleh",
  proofUrl: "Bukti",
} as const;
type OptionalColumn = keyof typeof COLUMN_LABELS;
const COLUMN_STORAGE_KEY = "workspace-cost-columns";

function emptyCostForm(): WorkspaceCostBody {
  return {
    costDate: new Date().toISOString().slice(0, 10),
    costName: "",
    amount: 0,
    category: "COM_LAINNYA",
    vendor: "",
    usagePeriod: "",
    paymentMethod: "",
    referenceNumber: "",
    proofUrl: "",
    notes: "",
  };
}

export function CostManager({
  initialRows,
  total,
  page,
  perPage,
  currentUser,
  permissions,
  onCreateRequest,
}: {
  initialRows: WorkspaceCostRow[];
  total: number;
  page: number;
  perPage: number;
  currentUser: CurrentUser;
  permissions: CostPermissions;
  onCreateRequest?: React.MutableRefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = React.useState(initialRows);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = React.useState(false);
  const [visible, setVisible] = React.useState<Record<OptionalColumn, boolean>>({
    category: true,
    vendor: true,
    usagePeriod: true,
    paymentMethod: true,
    referenceNumber: true,
    createdByName: true,
    proofUrl: true,
  });
  const [formState, setFormState] = React.useState<{ mode: "create" | "edit"; row: WorkspaceCostRow | null } | null>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<WorkspaceCostRow | null>(null);

  React.useEffect(() => { setRows(initialRows); setSelected(new Set()); setRefreshing(false); }, [initialRows]);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) setVisible((current) => ({ ...current, ...JSON.parse(saved) }));
    } catch { /* Preferensi rusak: gunakan default. */ }
  }, []);
  React.useEffect(() => { if (onCreateRequest) onCreateRequest.current = () => setFormState({ mode: "create", row: null }); }, [onCreateRequest]);

  function toggleColumn(key: OptionalColumn, checked: boolean) {
    setVisible((current) => {
      const next = { ...current, [key]: checked };
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function sortBy(sort: string) {
    const params = new URLSearchParams(searchParams.toString());
    const same = params.get("sort") === sort;
    params.set("sort", sort);
    params.set("order", same && params.get("order") !== "desc" ? "desc" : "asc");
    params.delete("page");
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  function refresh() {
    setRefreshing(true);
    router.refresh();
  }

  async function handleCancel(row: WorkspaceCostRow, reason: string) {
    try {
      await cancelWorkspaceCostAction(row.id, { reason: reason || null });
      toast.success("Biaya dibatalkan");
      setCancelTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membatalkan biaya");
    }
  }

  async function handleSubmit(row: WorkspaceCostRow) {
    try {
      await submitWorkspaceCostAction(row.id);
      toast.success("Biaya diajukan");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengajukan biaya");
    }
  }

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const exportQuery = new URLSearchParams(searchParams.toString());
  exportQuery.delete("page");
  exportQuery.delete("perPage");
  const hasFilters = ["from", "to", "category", "status", "search"].some((key) => searchParams.has(key));

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold text-slate-700">{total.toLocaleString("id-ID")} biaya ditemukan</p>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={refreshing} onClick={refresh} aria-label="Perbarui data">
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Perbarui data</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Tampilan Kolom</Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Kolom Opsional</DropdownMenuLabel>
                {(Object.keys(COLUMN_LABELS) as OptionalColumn[]).map((key) => (
                  <DropdownMenuCheckboxItem key={key} checked={visible[key]} onCheckedChange={(checked) => toggleColumn(key, checked === true)}>
                    {COLUMN_LABELS[key]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {permissions.export ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem asChild><a href={`/api/workspace/biaya-operasional/export.csv?${exportQuery}`}><FileText className="h-3.5 w-3.5" /> Export CSV</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/workspace/biaya-operasional/export.xlsx?${exportQuery}`}><FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {selected.size ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-xs">
            <strong>{selected.size} biaya dipilih</strong>
            {permissions.export ? (
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 bg-white" onClick={() => exportSelectedCsv(selectedRows)}>
                <Download className="h-3.5 w-3.5" /> Export Terpilih
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSelected(new Set())}>Batalkan Pilihan</Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-xs">
            <thead className="bg-slate-50/90 text-[10px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-11 px-3 py-3"><Checkbox aria-label="Pilih semua biaya halaman ini" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} /></th>
                <th className="w-12 px-3 py-3 text-left">No.</th>
                <SortableHeader label="Tanggal Biaya" sort="cost_date" onSort={sortBy} searchParams={searchParams} defaultOrder="desc" />
                <SortableHeader label="Nama Biaya" sort="cost_name" onSort={sortBy} searchParams={searchParams} />
                {visible.category ? <SortableHeader label="Kategori COM" sort="category" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.vendor ? <SortableHeader label="Vendor/Penyedia" sort="vendor" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.usagePeriod ? <th className="px-3 py-3 text-left">Periode Penggunaan</th> : null}
                {visible.paymentMethod ? <th className="px-3 py-3 text-left">Metode Pembayaran</th> : null}
                {visible.referenceNumber ? <th className="px-3 py-3 text-left">Nomor Referensi</th> : null}
                <SortableHeader label="Nominal" sort="amount" align="right" onSort={sortBy} searchParams={searchParams} />
                {visible.createdByName ? <SortableHeader label="Dibuat Oleh" sort="created_by_name" onSort={sortBy} searchParams={searchParams} /> : null}
                <SortableHeader label="Status" sort="status" onSort={sortBy} searchParams={searchParams} />
                {visible.proofUrl ? <th className="w-16 px-3 py-3 text-center">Bukti</th> : null}
                <th className="w-12 px-3 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const actions = computeCostAvailableActions(row, currentUser, permissions);
                const creatorRole = CREATOR_ROLE_LABEL[resolveCostRole(row.createdByName)];
                return (
                  <tr key={row.id} className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/80", selected.has(row.id) && "bg-blue-50/70")}>
                    <td className="px-3 py-2.5"><Checkbox aria-label={`Pilih ${row.costName}`} checked={selected.has(row.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{(page - 1) * perPage + index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{formatDate(row.costDate)}</td>
                    <td className="max-w-[220px] px-3 py-2.5"><button type="button" className="max-w-full truncate text-left font-medium text-slate-800 hover:text-primary hover:underline" title={row.costName} onClick={() => setDetailId(row.id)}>{row.costName}</button></td>
                    {visible.category ? <td className="px-3 py-2.5"><Badge variant="outline" className={CATEGORY_TONE[row.category]}>{WORKSPACE_COST_CATEGORY_LABEL[row.category]}</Badge></td> : null}
                    {visible.vendor ? <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-600">{row.vendor || "—"}</td> : null}
                    {visible.usagePeriod ? <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.usagePeriod || "—"}</td> : null}
                    {visible.paymentMethod ? <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.paymentMethod || "—"}</td> : null}
                    {visible.referenceNumber ? <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-600">{row.referenceNumber || "—"}</td> : null}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{formatRupiah(row.amount)}</td>
                    {visible.createdByName ? (
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p className="font-medium text-slate-800">{row.createdByName ?? "—"}</p>
                        {creatorRole ? <p className="text-[10px] text-slate-500">{creatorRole}</p> : null}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5"><Badge variant="outline" className={STATUS_TONE[row.status]}>{WORKSPACE_COST_STATUS_LABEL[row.status]}</Badge></td>
                    {visible.proofUrl ? (
                      <td className="px-3 py-2.5 text-center">
                        {row.proofUrl ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={row.proofUrl} target="_blank" rel="noreferrer noopener" className="inline-flex text-slate-500 hover:text-primary">
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Lihat Bukti Pembayaran</TooltipContent>
                          </Tooltip>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <RowActions
                        row={row}
                        actions={actions}
                        canAudit={permissions.auditRead}
                        onDetail={() => setDetailId(row.id)}
                        onEdit={() => setFormState({ mode: "edit", row })}
                        onSubmit={() => handleSubmit(row)}
                        onCancel={() => setCancelTarget(row)}
                      />
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center">
                    {hasFilters ? (
                      <p className="text-sm text-slate-500">Tidak ada biaya yang sesuai dengan filter.</p>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-slate-700">Belum ada biaya operasional</p>
                        <p className="mt-1 text-xs text-slate-500">Tambahkan biaya CRM seperti Mekari, WhatsApp API, AI, broadcast, atau software CRM lainnya.</p>
                      </>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <CostFormSheet state={formState} onClose={() => setFormState(null)} onSaved={() => { setFormState(null); router.refresh(); }} />
      <CostDetailSheet id={detailId} currentUser={currentUser} permissions={permissions} onClose={() => setDetailId(null)} onChanged={() => router.refresh()} onEdit={(row) => setFormState({ mode: "edit", row })} />
      <CancelDialog row={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} />
    </TooltipProvider>
  );
}

function exportSelectedCsv(rows: WorkspaceCostRow[]) {
  const headers = ["TanggalBiaya", "NamaBiaya", "Kategori", "Vendor", "PeriodePenggunaan", "MetodePembayaran", "NomorReferensi", "Nominal", "DibuatOleh", "Status"];
  const escape = (value: string | number) => {
    const source = String(value);
    const safe = /^[=+\-@]/.test(source) ? `'${source}` : source;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = rows.map((row) =>
    [row.costDate, row.costName, row.category, row.vendor ?? "", row.usagePeriod ?? "", row.paymentMethod ?? "", row.referenceNumber ?? "", Number(row.amount), row.createdByName ?? "", row.status]
      .map(escape)
      .join(",")
  );
  const csv = "﻿" + [headers.join(","), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `biaya-operasional-terpilih-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function SortableHeader({
  label,
  sort,
  align = "left",
  defaultOrder = "asc",
  onSort,
  searchParams,
}: {
  label: string;
  sort: string;
  align?: "left" | "right";
  defaultOrder?: "asc" | "desc";
  onSort: (sort: string) => void;
  searchParams: URLSearchParams;
}) {
  const active = (searchParams.get("sort") ?? "cost_date") === sort;
  const order = active ? searchParams.get("order") ?? defaultOrder : defaultOrder;
  const Icon = order === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={cn("px-3 py-3", align === "right" && "text-right")}>
      <button type="button" className={cn("inline-flex items-center gap-1 whitespace-nowrap", align === "right" && "justify-end")} onClick={() => onSort(sort)}>
        {label}{active ? <Icon className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

function RowActions({
  row,
  actions,
  canAudit,
  onDetail,
  onEdit,
  onSubmit,
  onCancel,
}: {
  row: WorkspaceCostRow;
  actions: ReturnType<typeof computeCostAvailableActions>;
  canAudit: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const stageLabel = actions.stage === "LEADER_VERIFY" ? "Verifikasi sebagai Leader" : actions.stage === "SPV_APPROVE" ? "Setujui sebagai SPV" : "Setujui sebagai Direktur";
  return (
    <div className="flex justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Aksi lainnya"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDetail}>Lihat Detail</DropdownMenuItem>
          {actions.canEdit ? <DropdownMenuItem onSelect={onEdit}>Edit Draft</DropdownMenuItem> : null}
          {actions.canSubmit ? <DropdownMenuItem onSelect={onSubmit}>Ajukan</DropdownMenuItem> : null}
          {actions.canDecide ? <DropdownMenuItem onSelect={onDetail}>{stageLabel}</DropdownMenuItem> : null}
          {actions.canRequestRevision ? <DropdownMenuItem onSelect={onDetail}>Minta Revisi</DropdownMenuItem> : null}
          {row.proofUrl ? <DropdownMenuItem asChild><a href={row.proofUrl} target="_blank" rel="noreferrer noopener">Lihat Bukti</a></DropdownMenuItem> : null}
          {canAudit ? <DropdownMenuItem onSelect={onDetail}>Lihat Audit History</DropdownMenuItem> : null}
          {actions.canReject || actions.canCancel ? <DropdownMenuSeparator /> : null}
          {actions.canReject ? <DropdownMenuItem destructive onSelect={onDetail}>Tolak</DropdownMenuItem> : null}
          {actions.canCancel ? <DropdownMenuItem destructive onSelect={onCancel}>Batalkan</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CancelDialog({ row, onClose, onConfirm }: { row: WorkspaceCostRow | null; onClose: () => void; onConfirm: (row: WorkspaceCostRow, reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (row) setReason(""); }, [row]);
  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan biaya?</AlertDialogTitle>
          <AlertDialogDescription>{row?.costName} tidak akan lanjut ke tahap approval berikutnya dan tidak masuk COM.</AlertDialogDescription>
        </AlertDialogHeader>
        <Field label="Alasan pembatalan"><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Opsional..." /></Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault();
              if (!row) return;
              setBusy(true);
              await onConfirm(row, reason);
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Batalkan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CostFormSheet({
  state,
  onClose,
  onSaved,
}: {
  state: { mode: "create" | "edit"; row: WorkspaceCostRow | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<WorkspaceCostBody>(emptyCostForm());
  const [saving, setSaving] = React.useState<"draft" | "submit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!state) return;
    setError(null);
    const row = state.row;
    setForm(
      row
        ? { costDate: row.costDate, costName: row.costName, amount: Number(row.amount), category: row.category, vendor: row.vendor ?? "", usagePeriod: row.usagePeriod ?? "", paymentMethod: row.paymentMethod ?? "", referenceNumber: row.referenceNumber ?? "", proofUrl: row.proofUrl ?? "", notes: "" }
        : emptyCostForm()
    );
  }, [state]);

  async function save(mode: "draft" | "submit") {
    setSaving(mode);
    setError(null);
    try {
      let id: number;
      if (state?.mode === "edit" && state.row) {
        id = state.row.id;
        await updateWorkspaceCostDraftAction(id, form);
      } else {
        id = await createWorkspaceCostAction(form);
      }
      if (mode === "submit") await submitWorkspaceCostAction(id);
      toast.success(mode === "submit" ? "Biaya diajukan" : "Draft biaya disimpan");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan biaya");
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{state?.mode === "edit" ? "Edit Biaya Operasional" : "Tambah Biaya Operasional"}</SheetTitle>
          <SheetDescription>Catat biaya COM CRM dan ajukan melalui alur persetujuan.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p> : null}

          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Informasi Utama</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal Biaya" required><Input type="date" value={form.costDate} onChange={(event) => setForm((current) => ({ ...current, costDate: event.target.value }))} /></Field>
              <Field label="Nominal" required><Input type="number" min={1} value={form.amount || ""} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} placeholder="0" /></Field>
            </div>
            <Field label="Nama Biaya" required><Input value={form.costName} onChange={(event) => setForm((current) => ({ ...current, costName: event.target.value }))} placeholder="Contoh: Biaya Mekari Agustus 2026" /></Field>
            <Field label="Kategori COM" required>
              <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value as WorkspaceCostCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WORKSPACE_COST_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{WORKSPACE_COST_CATEGORY_LABEL[category]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Field label="Vendor/Penyedia"><Input value={form.vendor ?? ""} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Contoh: Mekari" /></Field>
            <Field label="Periode Penggunaan"><Input value={form.usagePeriod ?? ""} onChange={(event) => setForm((current) => ({ ...current, usagePeriod: event.target.value }))} placeholder="Contoh: Agustus 2026" /></Field>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Field label="Metode Pembayaran">
              <Select value={form.paymentMethod || "__NONE__"} onValueChange={(value) => setForm((current) => ({ ...current, paymentMethod: value === "__NONE__" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih metode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">—</SelectItem>
                  {["Transfer Bank", "Virtual Account", "Kartu Kredit", "Tunai", "Lainnya"].map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nomor Referensi"><Input value={form.referenceNumber ?? ""} onChange={(event) => setForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></Field>
          </section>

          <Field label="Bukti Pembayaran (URL)"><Input value={form.proofUrl ?? ""} onChange={(event) => setForm((current) => ({ ...current, proofUrl: event.target.value }))} placeholder="https://..." /></Field>
          <Field label="Catatan"><Textarea rows={3} value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Tambahkan penjelasan kebutuhan biaya, periode, atau informasi lainnya." /></Field>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="button" variant="outline" onClick={() => save("draft")} disabled={busy}>
            {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Simpan Draft
          </Button>
          <Button type="button" onClick={() => save("submit")} disabled={busy}>
            {saving === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Simpan dan Ajukan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      {children}
    </div>
  );
}
