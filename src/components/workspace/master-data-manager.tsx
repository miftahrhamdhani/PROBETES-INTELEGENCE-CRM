"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FilterX,
  History,
  Layers3,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Tags,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkSetWorkspaceProductsActiveAction,
  createWorkspaceProductAction,
  createWorkspaceProductAliasAction,
  deactivateWorkspaceProductAction,
  loadWorkspaceProductAction,
  loadWorkspaceProductAliasesAction,
  loadWorkspaceProductAuditAction,
  loadWorkspaceProductUsageAction,
  reactivateWorkspaceProductAction,
  updateWorkspaceProductAction,
  updateWorkspaceProductAliasAction,
} from "@/app/workspace-master-data-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRupiah } from "@/lib/format";
import type { WorkspaceProductRow } from "@/lib/workspace-master-data-contracts";
import { cn } from "@/lib/utils";

const USAGE_LABEL = { SELLABLE: "Sellable", BONUS_ONLY: "Bonus Only", SELLABLE_AND_BONUS: "Sellable + Bonus", INACTIVE: "Inactive" } as const;
const COLUMN_LABELS = { productUsage: "Jenis Produk", sellingPrice: "Harga Jual", unitHpp: "HPP", usageCount: "Usage", aliasCount: "Alias", updatedAt: "Updated At" } as const;
type OptionalColumn = keyof typeof COLUMN_LABELS;
type FormState = {
  productId: string;
  productName: string;
  sellingPrice: string;
  unitHpp: string;
  productUsage: "SELLABLE" | "BONUS_ONLY" | "SELLABLE_AND_BONUS";
  description: string;
  isActive: boolean;
};
const emptyForm = (): FormState => ({ productId: "", productName: "", sellingPrice: "", unitHpp: "0", productUsage: "SELLABLE", description: "", isActive: true });
const COLUMN_STORAGE_KEY = "workspace-master-product-columns";
const FILTER_PARAM_KEYS = ["search", "productUsage", "status", "minPrice", "maxPrice", "minHpp", "maxHpp", "alias", "used", "createdFrom", "createdTo", "updatedFrom", "updatedTo"] as const;

export function MasterProductManager({
  initialRows,
  total,
  page,
  perPage,
  permissions,
  onCreateRequest,
}: {
  initialRows: WorkspaceProductRow[];
  total: number;
  page: number;
  perPage: number;
  permissions: { create: boolean; update: boolean; deactivate: boolean; alias: boolean; audit: boolean; export: boolean };
  onCreateRequest?: React.MutableRefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = React.useState(initialRows);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [visible, setVisible] = React.useState<Record<OptionalColumn, boolean>>({ productUsage: true, sellingPrice: true, unitHpp: true, usageCount: true, aliasCount: true, updatedAt: false });
  const [formDialog, setFormDialog] = React.useState<{ mode: "create" | "edit"; row: WorkspaceProductRow | null } | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<WorkspaceProductRow | null>(null);
  const [aliasTarget, setAliasTarget] = React.useState<WorkspaceProductRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<WorkspaceProductRow[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { setRows(initialRows); setSelected(new Set()); }, [initialRows]);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) setVisible((current) => ({ ...current, ...JSON.parse(saved) }));
    } catch { /* Preferensi rusak: gunakan default. */ }
  }, []);
  React.useEffect(() => { if (onCreateRequest) onCreateRequest.current = () => setFormDialog({ mode: "create", row: null }); }, [onCreateRequest]);

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

  async function handleSetActive(products: WorkspaceProductRow[], active: boolean, reason?: string) {
    setBusy(true);
    try {
      if (products.length === 1) {
        if (active) await reactivateWorkspaceProductAction(products[0]!.id);
        else await deactivateWorkspaceProductAction(products[0]!.id, { reason });
      } else {
        await bulkSetWorkspaceProductsActiveAction({ ids: products.map((product) => product.id), active, reason });
      }
      toast.success(active ? "Produk berhasil diaktifkan" : "Produk berhasil dinonaktifkan");
      setDeactivateTarget(null);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah status produk");
    } finally { setBusy(false); }
  }

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const exportQuery = new URLSearchParams(searchParams.toString());
  exportQuery.delete("page");
  exportQuery.delete("perPage");
  const hasFilters = FILTER_PARAM_KEYS.some((key) => searchParams.has(key));
  function resetFilters() {
    router.push(pathname, { scroll: false });
  }

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold text-slate-700">{total.toLocaleString("id-ID")} produk terdaftar</p>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Tampilan Kolom</Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Kolom Opsional</DropdownMenuLabel>
                {(Object.keys(COLUMN_LABELS) as OptionalColumn[]).map((key) => <DropdownMenuCheckboxItem key={key} checked={visible[key]} onCheckedChange={(checked) => toggleColumn(key, checked === true)}>{COLUMN_LABELS[key]}</DropdownMenuCheckboxItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            {permissions.export ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem asChild><a href={`/api/workspace/master-produk/export.csv?${exportQuery}`}><FileText className="h-3.5 w-3.5" /> Export CSV</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/workspace/master-produk/export.xlsx?${exportQuery}`}><FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {selected.size ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-xs">
            <strong>{selected.size} produk dipilih</strong>
            {permissions.deactivate ? <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 bg-white" onClick={() => handleSetActive(selectedRows, true)}><CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan</Button> : null}
            {permissions.deactivate ? <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 bg-white text-destructive" onClick={() => setDeactivateTarget(selectedRows)}><XCircle className="h-3.5 w-3.5" /> Nonaktifkan</Button> : null}
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSelected(new Set())}>Batalkan Pilihan</Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-xs">
            <thead className="bg-slate-50/90 text-[10px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-11 px-3 py-3"><Checkbox aria-label="Pilih semua produk halaman ini" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} /></th>
                <th className="w-12 px-3 py-3 text-left">No.</th>
                <SortableHeader label="Product ID" sort="product_id" onSort={sortBy} searchParams={searchParams} />
                <SortableHeader label="Nama Produk" sort="product_name" onSort={sortBy} searchParams={searchParams} />
                {visible.productUsage ? <SortableHeader label="Jenis Produk" sort="product_usage" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.sellingPrice ? <SortableHeader label="Harga Jual" sort="selling_price" align="right" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.unitHpp ? <SortableHeader label="HPP" sort="unit_hpp" align="right" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.usageCount ? <SortableHeader label="Usage" sort="usage_count" onSort={sortBy} searchParams={searchParams} /> : null}
                <SortableHeader label="Status" sort="status" onSort={sortBy} searchParams={searchParams} />
                {visible.aliasCount ? <SortableHeader label="Alias" sort="alias_count" onSort={sortBy} searchParams={searchParams} /> : null}
                {visible.updatedAt ? <SortableHeader label="Updated At" sort="updated_at" onSort={sortBy} searchParams={searchParams} /> : null}
                <th className="w-28 px-3 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/80", selected.has(row.id) && "bg-blue-50/70")}>
                  <td className="px-3 py-2.5"><Checkbox aria-label={`Pilih ${row.productName}`} checked={selected.has(row.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{(page - 1) * perPage + index + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-slate-700">{row.productId}</td>
                  <td className="max-w-[260px] px-3 py-2.5"><button type="button" className="max-w-full truncate font-medium text-slate-800 hover:text-primary hover:underline" title={row.productName} onClick={() => setDetailTarget(row)}>{row.productName}</button></td>
                  {visible.productUsage ? <td className="px-3 py-2.5"><UsageBadge usage={row.productUsage} /></td> : null}
                  {visible.sellingPrice ? <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{row.sellingPrice == null || row.sellingPrice === "0" ? "—" : formatRupiah(row.sellingPrice)}</td> : null}
                  {visible.unitHpp ? <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatRupiah(row.unitHpp)}</td> : null}
                  {visible.usageCount ? <td className="px-3 py-2.5"><Tooltip><TooltipTrigger asChild><button type="button" className="inline-flex items-center gap-1 text-slate-600 hover:text-primary" onClick={() => setDetailTarget(row)}><Layers3 className="h-3.5 w-3.5 text-blue-500" /> {row.usageCount.toLocaleString("id-ID")} transaksi</button></TooltipTrigger><TooltipContent>Jumlah transaksi yang menggunakan produk ini.</TooltipContent></Tooltip></td> : null}
                  <td className="px-3 py-2.5">{row.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}</td>
                  {visible.aliasCount ? <td className="px-3 py-2.5"><button type="button" className={cn("tabular-nums", row.aliasCount && "font-semibold text-primary hover:underline")} onClick={() => setAliasTarget(row)}>{row.aliasCount}</button></td> : null}
                  {visible.updatedAt ? <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatDate(row.updatedAt)}</td> : null}
                  <td className="px-3 py-2.5"><RowActions row={row} permissions={permissions} onDetail={() => setDetailTarget(row)} onEdit={() => setFormDialog({ mode: "edit", row })} onAlias={() => setAliasTarget(row)} onDeactivate={() => setDeactivateTarget([row])} onReactivate={() => handleSetActive([row], true)} /></td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={12} className="px-4 py-16 text-center">
                    {hasFilters ? (
                      <>
                        <FilterX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">Tidak ada produk yang sesuai dengan filter.</p>
                        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={resetFilters}>Reset Filter</Button>
                      </>
                    ) : (
                      <>
                        <Package className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada produk.</p>
                        {permissions.create ? (
                          <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={() => setFormDialog({ mode: "create", row: null })}>
                            <Plus className="h-4 w-4" /> Tambah Produk
                          </Button>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <ProductFormDialog state={formDialog} onClose={() => setFormDialog(null)} onSaved={() => { setFormDialog(null); router.refresh(); }} />
      <ProductDetailSheet product={detailTarget} onClose={() => setDetailTarget(null)} permissions={permissions} onEdit={(row) => setFormDialog({ mode: "edit", row })} />
      <AliasManager product={aliasTarget} onClose={() => setAliasTarget(null)} canManage={permissions.alias} />
      <DeactivateDialog products={deactivateTarget} busy={busy} onClose={() => setDeactivateTarget(null)} onConfirm={(reason) => deactivateTarget && handleSetActive(deactivateTarget, false, reason)} />
    </TooltipProvider>
  );
}

function SortableHeader({ label, sort, align = "left", onSort, searchParams }: { label: string; sort: string; align?: "left" | "right"; onSort: (sort: string) => void; searchParams: URLSearchParams }) {
  const active = (searchParams.get("sort") ?? "product_id") === sort;
  const Icon = searchParams.get("order") === "desc" ? ArrowDown : ArrowUp;
  return <th className={cn("px-3 py-3", align === "right" && "text-right")}><button type="button" className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")} onClick={() => onSort(sort)}>{label}{active ? <Icon className="h-3 w-3" /> : null}</button></th>;
}

function UsageBadge({ usage }: { usage: WorkspaceProductRow["productUsage"] }) {
  return <Badge variant="outline" className={cn(usage === "SELLABLE" && "border-blue-200 bg-blue-50 text-blue-700", usage === "BONUS_ONLY" && "border-purple-200 bg-purple-50 text-purple-700", usage === "SELLABLE_AND_BONUS" && "border-indigo-200 bg-indigo-50 text-indigo-700", usage === "INACTIVE" && "border-slate-200 bg-slate-100 text-slate-600")}>{USAGE_LABEL[usage]}</Badge>;
}

function RowActions({ row, permissions, onDetail, onEdit, onAlias, onDeactivate, onReactivate }: { row: WorkspaceProductRow; permissions: { update: boolean; deactivate: boolean; alias: boolean; audit: boolean }; onDetail: () => void; onEdit: () => void; onAlias: () => void; onDeactivate: () => void; onReactivate: () => void }) {
  return <div className="flex justify-center gap-0.5"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Lihat Detail" onClick={onDetail}><Eye className="h-3.5 w-3.5" /></Button>{permissions.update ? <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit Produk" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button> : null}<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Aksi lainnya"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={onDetail}><Eye className="h-3.5 w-3.5" /> Lihat Detail</DropdownMenuItem>{permissions.update ? <DropdownMenuItem onSelect={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit Produk</DropdownMenuItem> : null}{permissions.alias ? <DropdownMenuItem onSelect={onAlias}><Tags className="h-3.5 w-3.5" /> Kelola Alias</DropdownMenuItem> : null}{permissions.audit ? <DropdownMenuItem onSelect={onDetail}><History className="h-3.5 w-3.5" /> Lihat Histori</DropdownMenuItem> : null}{permissions.deactivate ? <><DropdownMenuSeparator />{row.isActive ? <DropdownMenuItem destructive onSelect={onDeactivate}><XCircle className="h-3.5 w-3.5" /> Nonaktifkan</DropdownMenuItem> : <DropdownMenuItem onSelect={onReactivate}><CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan kembali</DropdownMenuItem>}</> : null}</DropdownMenuContent></DropdownMenu></div>;
}

function ProductFormDialog({ state, onClose, onSaved }: { state: { mode: "create" | "edit"; row: WorkspaceProductRow | null } | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<FormState>(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (!state) return; const row = state.row; setError(null); setForm(row ? { productId: row.productId, productName: row.productName, sellingPrice: row.sellingPrice ?? "", unitHpp: row.unitHpp, productUsage: row.productUsage === "INACTIVE" ? "SELLABLE" : row.productUsage, description: row.description ?? "", isActive: row.isActive } : emptyForm()); }, [state]);
  async function save() { setSaving(true); setError(null); try { const body = { productName: form.productName, sellingPrice: form.sellingPrice.trim() ? Number(form.sellingPrice) : null, unitHpp: Number(form.unitHpp || 0), productUsage: form.productUsage, description: form.description.trim() || null, isActive: form.isActive }; if (state?.mode === "edit" && state.row) await updateWorkspaceProductAction(state.row.id, body); else await createWorkspaceProductAction({ ...body, productId: form.productId }); toast.success(state?.mode === "edit" ? "Produk berhasil diperbarui" : "Produk berhasil ditambahkan"); onSaved(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan produk"); } finally { setSaving(false); } }
  return <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{state?.mode === "edit" ? "Edit Produk" : "Produk Baru"}</DialogTitle></DialogHeader><DialogBody className="grid gap-3 sm:grid-cols-2">{error ? <p className="col-span-full rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}<Field label="Product ID" required><Input value={form.productId} readOnly={state?.mode === "edit"} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value.toUpperCase() }))} placeholder="PRO-0001" /></Field><Field label="Nama Produk" required><Input value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} /></Field><Field label="Harga Jual" required={form.productUsage !== "BONUS_ONLY"}><Input type="number" min={0} value={form.sellingPrice} onChange={(event) => setForm((current) => ({ ...current, sellingPrice: event.target.value }))} placeholder={form.productUsage === "BONUS_ONLY" ? "Opsional" : "0"} /></Field><Field label="HPP" required><Input type="number" min={0} value={form.unitHpp} onChange={(event) => setForm((current) => ({ ...current, unitHpp: event.target.value }))} /></Field><Field label="Jenis Produk" required><Select value={form.productUsage} onValueChange={(value) => setForm((current) => ({ ...current, productUsage: value as FormState["productUsage"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SELLABLE">Sellable</SelectItem><SelectItem value="BONUS_ONLY">Bonus Only</SelectItem><SelectItem value="SELLABLE_AND_BONUS">Sellable + Bonus</SelectItem></SelectContent></Select></Field><label className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Status Aktif</label><Field label="Keterangan" className="sm:col-span-2"><Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Batal</Button><Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {state?.mode === "edit" ? "Simpan Perubahan" : "Simpan Produk"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ProductDetailSheet({ product, onClose, permissions, onEdit }: { product: WorkspaceProductRow | null; onClose: () => void; permissions: { update: boolean; alias: boolean; audit: boolean }; onEdit: (row: WorkspaceProductRow) => void }) {
  const [detail, setDetail] = React.useState<WorkspaceProductRow | null>(null);
  const [aliases, setAliases] = React.useState<Awaited<ReturnType<typeof loadWorkspaceProductAliasesAction>> | null>(null);
  const [audit, setAudit] = React.useState<Awaited<ReturnType<typeof loadWorkspaceProductAuditAction>> | null>(null);
  const [usage, setUsage] = React.useState<Awaited<ReturnType<typeof loadWorkspaceProductUsageAction>> | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { if (!product) return; setLoading(true); setAliases(null); setAudit(null); setUsage(null); loadWorkspaceProductAction(product.id).then(setDetail).finally(() => setLoading(false)); }, [product]);
  async function loadTab(tab: string) { if (!product) return; if (tab === "alias" && !aliases) setAliases(await loadWorkspaceProductAliasesAction(product.id)); if (tab === "history" && permissions.audit && !audit) setAudit(await loadWorkspaceProductAuditAction(product.id)); if (tab === "usage" && !usage) setUsage(await loadWorkspaceProductUsageAction({ productInternalId: product.id, page: 1, perPage: 10 })); }
  const row = detail ?? product;
  return <Sheet open={product !== null} onOpenChange={(open) => !open && onClose()}><SheetContent className="sm:max-w-2xl"><SheetHeader><SheetTitle>{row?.productName ?? "Detail Produk"}</SheetTitle><SheetDescription>{row?.productId ?? "Memuat..."}</SheetDescription></SheetHeader><SheetBody>{loading || !row ? <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" /> : <Tabs defaultValue="summary" onValueChange={loadTab}><TabsList className="grid w-full grid-cols-4"><TabsTrigger value="summary">Ringkasan</TabsTrigger><TabsTrigger value="alias">Alias</TabsTrigger><TabsTrigger value="history">Histori</TabsTrigger><TabsTrigger value="usage">Penggunaan</TabsTrigger></TabsList><TabsContent value="summary" className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-xs"><Detail label="Product ID" value={row.productId} /><Detail label="Nama Produk" value={row.productName} /><Detail label="Harga Jual" value={row.sellingPrice ? formatRupiah(row.sellingPrice) : "—"} /><Detail label="HPP" value={formatRupiah(row.unitHpp)} /><Detail label="Jenis Produk" value={USAGE_LABEL[row.productUsage]} /><Detail label="Status" value={row.isActive ? "Aktif" : "Nonaktif"} /><Detail label="Jumlah Alias" value={String(row.aliasCount)} /><Detail label="Jumlah Penggunaan" value={`${row.usageCount} transaksi`} /><Detail label="Tanggal Dibuat" value={formatDate(row.createdAt)} /><Detail label="Terakhir Diubah" value={formatDate(row.updatedAt)} /><Detail label="Dibuat Oleh" value={row.createdByName ?? "Sistem"} /><Detail label="Diubah Oleh" value={row.updatedByName ?? "Sistem"} /><Detail label="Keterangan" value={row.description ?? "—"} className="col-span-2" /></div>{permissions.update ? <Button type="button" size="sm" onClick={() => onEdit(row)}><Pencil className="h-3.5 w-3.5" /> Edit Produk</Button> : null}</TabsContent><TabsContent value="alias"><SimpleLoader value={aliases}>{aliases?.length ? <ul className="space-y-2">{aliases.map((item) => <li key={item.id} className="rounded-lg border p-3 text-xs"><strong>{item.aliasName}</strong><p className="text-muted-foreground">{item.sourceSystem} · {item.isActive ? "Aktif" : "Nonaktif"}</p></li>)}</ul> : <Empty text="Belum ada alias." />}</SimpleLoader></TabsContent><TabsContent value="history">{!permissions.audit ? <Empty text="Permission histori diperlukan." /> : <SimpleLoader value={audit}>{audit?.length ? <ul className="space-y-2">{audit.map((item) => <li key={item.id} className="rounded-lg border p-3 text-xs"><div className="flex justify-between gap-2"><strong>{auditLabel(item.action)}</strong><span className="text-muted-foreground">{formatDate(item.createdAt)}</span></div><p className="text-muted-foreground">{item.actorName ?? "Sistem"}{item.reason ? ` · ${item.reason}` : ""}</p></li>)}</ul> : <Empty text="Belum ada histori." />}</SimpleLoader>}</TabsContent><TabsContent value="usage"><SimpleLoader value={usage}>{usage?.rows.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-xs"><thead className="bg-muted"><tr><th className="p-2 text-left">Order ID</th><th className="p-2 text-left">Tanggal</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Tipe</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga Snapshot</th><th className="p-2 text-right">HPP Snapshot</th></tr></thead><tbody>{usage.rows.map((item) => <tr key={`${item.orderId}-${item.itemType}`} className="border-t"><td className="p-2">{item.orderNumber}</td><td className="p-2">{item.orderDate}</td><td className="p-2">{item.customerName}</td><td className="p-2">{item.itemType}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2 text-right">{formatRupiah(item.sellingPriceSnapshot)}</td><td className="p-2 text-right">{formatRupiah(item.unitHppSnapshot)}</td></tr>)}</tbody></table></div> : <Empty text="Produk belum pernah digunakan." />}</SimpleLoader></TabsContent></Tabs>}</SheetBody></SheetContent></Sheet>;
}

function AliasManager({ product, onClose, canManage }: { product: WorkspaceProductRow | null; onClose: () => void; canManage: boolean }) {
  type AliasRow = Awaited<ReturnType<typeof loadWorkspaceProductAliasesAction>>[number];
  const [rows, setRows] = React.useState<AliasRow[]>([]);
  const [form, setForm] = React.useState({ aliasName: "", sourceSystem: "DATABASE_ALL", notes: "", isActive: true });
  const [editing, setEditing] = React.useState<AliasRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => { if (product) setRows(await loadWorkspaceProductAliasesAction(product.id)); }, [product]);
  React.useEffect(() => { if (product) { setForm({ aliasName: "", sourceSystem: "DATABASE_ALL", notes: "", isActive: true }); setEditing(null); load(); } }, [load, product]);
  async function save() { if (!product) return; setBusy(true); try { if (editing) await updateWorkspaceProductAliasAction(editing.id, form); else await createWorkspaceProductAliasAction({ productInternalId: product.id, ...form }); toast.success(editing ? "Alias diperbarui" : "Alias ditambahkan"); setEditing(null); setForm({ aliasName: "", sourceSystem: "DATABASE_ALL", notes: "", isActive: true }); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menyimpan alias"); } finally { setBusy(false); } }
  return <Sheet open={product !== null} onOpenChange={(open) => !open && onClose()}><SheetContent><SheetHeader><SheetTitle>Kelola Alias</SheetTitle><SheetDescription>{product?.productId} — {product?.productName}</SheetDescription></SheetHeader><SheetBody className="space-y-4">{canManage ? <div className="grid gap-3 rounded-xl border p-4"><Field label="Nama Alias" required><Input value={form.aliasName} onChange={(event) => setForm((current) => ({ ...current, aliasName: event.target.value }))} /></Field><Field label="Source System"><Input value={form.sourceSystem} onChange={(event) => setForm((current) => ({ ...current, sourceSystem: event.target.value }))} /></Field><Field label="Catatan"><Textarea rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field><label className="flex items-center gap-2 text-xs"><Checkbox checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Alias Aktif</label><div className="flex justify-end gap-2">{editing ? <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setForm({ aliasName: "", sourceSystem: "DATABASE_ALL", notes: "", isActive: true }); }}>Batal Edit</Button> : null}<Button type="button" size="sm" onClick={save} disabled={busy || !form.aliasName.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {editing ? "Simpan Alias" : "Tambah Alias"}</Button></div></div> : null}<div className="space-y-2">{rows.length ? rows.map((row) => <button key={row.id} type="button" className="w-full rounded-lg border p-3 text-left text-xs hover:bg-muted" onClick={() => canManage && (setEditing(row), setForm({ aliasName: row.aliasName, sourceSystem: row.sourceSystem, notes: row.notes ?? "", isActive: row.isActive }))}><div className="flex justify-between gap-2"><strong>{row.aliasName}</strong><Badge variant={row.isActive ? "success" : "secondary"}>{row.isActive ? "Aktif" : "Nonaktif"}</Badge></div><p className="text-muted-foreground">{row.sourceSystem}{row.notes ? ` · ${row.notes}` : ""}</p></button>) : <Empty text="Belum ada alias." />}</div></SheetBody></SheetContent></Sheet>;
}

function DeactivateDialog({ products, busy, onClose, onConfirm }: { products: WorkspaceProductRow[] | null; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (products) setReason(""); }, [products]);
  return <AlertDialog open={products !== null} onOpenChange={(open) => !open && onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Nonaktifkan produk?</AlertDialogTitle><AlertDialogDescription>{products?.length === 1 ? products[0]?.productName : `${products?.length ?? 0} produk`} tidak akan muncul pada input Pesanan baru, tetapi tetap tersedia pada histori transaksi.</AlertDialogDescription></AlertDialogHeader><Field label="Alasan penonaktifan" required><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan..." /></Field><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy || reason.trim().length < 3} onClick={(event) => { event.preventDefault(); onConfirm(reason); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Nonaktifkan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) { return <div className={cn("grid gap-1.5", className)}><Label className="text-xs">{label}{required ? <span className="text-destructive"> *</span> : null}</Label>{children}</div>; }
function Detail({ label, value, className }: { label: string; value: string; className?: string }) { return <div className={className}><p className="text-muted-foreground">{label}</p><p className="mt-0.5 font-medium text-slate-800">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">{text}</p>; }
function SimpleLoader({ value, children }: { value: unknown; children: React.ReactNode }) { return value === null ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : <>{children}</>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)); }
function auditLabel(action: string) { return ({ PRODUCT_CREATE: "Produk dibuat", PRODUCT_UPDATE: "Produk diperbarui", PRODUCT_DEACTIVATE: "Produk dinonaktifkan", PRODUCT_REACTIVATE: "Produk diaktifkan kembali" } as Record<string, string>)[action] ?? action; }
