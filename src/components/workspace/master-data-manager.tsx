"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  createWorkspaceProductAction,
  createWorkspaceProductAliasAction,
  deactivateWorkspaceProductAction,
  loadWorkspaceProductAliasesAction,
  updateWorkspaceProductAction,
} from "@/app/workspace-master-data-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AuditLogList } from "@/components/workspace/audit-log-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORKSPACE_PRODUCT_USAGES, type WorkspaceProductRow } from "@/lib/workspace-master-data-contracts";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

const USAGE_LABEL: Record<string, string> = {
  SELLABLE: "Sellable",
  BONUS_ONLY: "Bonus Only",
  SELLABLE_AND_BONUS: "Sellable + Bonus",
  INACTIVE: "Inactive",
};

type FormState = {
  productName: string;
  sellingPrice: string;
  unitHpp: string;
  productUsage: (typeof WORKSPACE_PRODUCT_USAGES)[number];
  description: string;
  isActive: boolean;
};

function emptyForm(): FormState {
  return { productName: "", sellingPrice: "", unitHpp: "0", productUsage: "SELLABLE", description: "", isActive: true };
}

function toForm(row: WorkspaceProductRow): FormState {
  return {
    productName: row.productName,
    sellingPrice: row.sellingPrice ?? "",
    unitHpp: row.unitHpp,
    productUsage: row.productUsage,
    description: row.description ?? "",
    isActive: row.isActive,
  };
}

export function MasterDataManager({ initialRows, canManage }: { initialRows: WorkspaceProductRow[]; canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [dialogState, setDialogState] = React.useState<{ mode: "create" | "edit"; row: WorkspaceProductRow | null } | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<WorkspaceProductRow | null>(null);
  const [aliasTarget, setAliasTarget] = React.useState<WorkspaceProductRow | null>(null);

  React.useEffect(() => setRows(initialRows), [initialRows]);

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setDialogState({ mode: "create", row: null });
  }
  function openEdit(row: WorkspaceProductRow) {
    setForm(toForm(row));
    setError(null);
    setDialogState({ mode: "edit", row });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        productName: form.productName,
        sellingPrice: form.sellingPrice.trim() === "" ? null : Number(form.sellingPrice),
        unitHpp: Number(form.unitHpp || 0),
        productUsage: form.productUsage,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };
      if (dialogState?.mode === "edit" && dialogState.row) {
        await updateWorkspaceProductAction(dialogState.row.id, body);
        toast.success("Produk berhasil diperbarui");
      } else {
        await createWorkspaceProductAction(body);
        toast.success("Produk baru berhasil dibuat");
      }
      setDialogState(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await deactivateWorkspaceProductAction(deactivateTarget.id);
      toast.success(`${deactivateTarget.productName} dinonaktifkan`);
      setDeactivateTarget(null);
      router.refresh();
    } catch (deactivateError) {
      toast.error(deactivateError instanceof Error ? deactivateError.message : "Gagal menonaktifkan produk");
    }
  }

  const columns = React.useMemo<ColumnDef<WorkspaceProductRow, any>[]>(
    () => [
      { accessorKey: "productId", header: "Product ID", size: 100 },
      { accessorKey: "productName", header: "Nama Produk", size: 200 },
      { accessorKey: "sellingPrice", header: "Harga Jual", size: 110, cell: ({ getValue }) => <span className="tabular">{getValue() ? formatRupiah(getValue()) : "—"}</span> },
      { accessorKey: "unitHpp", header: "HPP", size: 100, cell: ({ getValue }) => <span className="tabular">{formatRupiah(getValue())}</span> },
      {
        accessorKey: "productUsage",
        header: "Usage",
        size: 140,
        cell: ({ getValue }) => <Badge variant="outline">{USAGE_LABEL[getValue() as string] ?? getValue()}</Badge>,
      },
      {
        accessorKey: "isActive",
        header: "Status",
        size: 90,
        cell: ({ getValue }) => (getValue() ? <Badge variant="success">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>),
      },
      { accessorKey: "aliasCount", header: "Alias", size: 70 },
      {
        id: "actions",
        header: "Aksi",
        size: 190,
        enableResizing: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAliasTarget(row.original)}>
              <Tags className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            {canManage ? (
              <>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(row.original)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                {row.original.isActive ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeactivateTarget(row.original)}>
                    Nonaktifkan
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canManage]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} produk terdaftar di Master Data</p>
        {canManage ? (
          <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Produk Baru
          </Button>
        ) : null}
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} loading={false} hasMore={false} onLoadMore={() => {}} height={520} />

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === "edit" ? `Edit ${dialogState.row?.productId}` : "Produk Baru"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p> : null}
            <Field label="Nama Produk" required>
              <Input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} />
            </Field>
            <Field label="Product Usage" required>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                value={form.productUsage}
                onChange={(e) => setForm((f) => ({ ...f, productUsage: e.target.value as FormState["productUsage"] }))}
              >
                {WORKSPACE_PRODUCT_USAGES.map((usage) => (
                  <option key={usage} value={usage}>{USAGE_LABEL[usage]}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Harga Jual" hint={form.productUsage === "BONUS_ONLY" ? "Kosongkan untuk Bonus Only" : undefined}>
                <Input type="number" min={0} value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} />
              </Field>
              <Field label="HPP" required>
                <Input type="number" min={0} value={form.unitHpp} onChange={(e) => setForm((f) => ({ ...f, unitHpp: e.target.value }))} />
              </Field>
            </div>
            <Field label="Keterangan">
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Aktif
            </label>
            {dialogState?.mode === "edit" && dialogState.row ? <AuditLogList entityType="WORKSPACE_PRODUCT" entityId={dialogState.row.id} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogState(null)} disabled={saving}>Batal</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan {deactivateTarget?.productName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk tidak akan muncul di input Pesanan baru. Histori pesanan yang sudah memakai produk ini tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>Nonaktifkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AliasDialog product={aliasTarget} onClose={() => setAliasTarget(null)} canManage={canManage} />
    </div>
  );
}

function AliasDialog({ product, onClose, canManage }: { product: WorkspaceProductRow | null; onClose: () => void; canManage: boolean }) {
  const [aliases, setAliases] = React.useState<Awaited<ReturnType<typeof loadWorkspaceProductAliasesAction>>>([]);
  const [loading, setLoading] = React.useState(false);
  const [newAlias, setNewAlias] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!product) return;
    setLoading(true);
    loadWorkspaceProductAliasesAction(product.id)
      .then(setAliases)
      .finally(() => setLoading(false));
  }, [product]);

  async function handleAdd() {
    if (!product || !newAlias.trim()) return;
    setSaving(true);
    try {
      await createWorkspaceProductAliasAction({ productInternalId: product.id, aliasName: newAlias.trim() });
      setNewAlias("");
      setAliases(await loadWorkspaceProductAliasesAction(product.id));
      toast.success("Alias produk ditambahkan");
    } catch (aliasError) {
      toast.error(aliasError instanceof Error ? aliasError.message : "Gagal menambah alias");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alias — {product?.productName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-xs text-muted-foreground">Nama mentah dari Database All yang dipetakan ke produk ini.</p>
          {loading ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Memuat...</p>
          ) : aliases.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada alias.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {aliases.map((alias) => (
                <li key={alias.id} className={cn("rounded-md border px-2 py-1", !alias.isActive && "opacity-50")}>
                  {alias.aliasName}
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <div className="flex items-center gap-1.5 pt-2">
              <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Nama alias baru" className="h-8 text-xs" />
              <Button type="button" size="sm" onClick={handleAdd} disabled={saving || !newAlias.trim()}>Tambah</Button>
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
        {hint ? <span className="ml-1 text-[10px] text-muted-foreground">({hint})</span> : null}
      </Label>
      {children}
    </div>
  );
}
