"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Activity, Loader2, Save, Trash2, User, UsersRound, X } from "lucide-react";
import {
  editGroupMembershipAction,
  loadGroupMemberDetailAction,
  removeGroupMembershipAction,
} from "@/app/group-membership-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SheetBody, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clusterLabel } from "@/components/customer/customer-columns";
import { formatDate, formatRupiah } from "@/lib/format";
import { GROUP_SOURCE_LABELS, type GroupMemberDetail } from "@/lib/group-membership-types";
import { cn } from "@/lib/utils";

const dash = (value: string | null | undefined) => (value?.trim() ? value : "—");
type Form = { groupName: string; joinedAt: string; picUserId: string; notes: string };
const toForm = (detail: GroupMemberDetail): Form => ({
  groupName: detail.groupName ?? "",
  joinedAt: detail.joinedAt ?? "",
  picUserId: detail.picUserId == null ? "" : String(detail.picUserId),
  notes: detail.notes ?? "",
});

/** Detail, edit, dan remove membership. Customer/transaksi tetap read-only. */
export function GroupMemberDetailSheet({
  customerId,
  picOptions,
  groupOptions,
  onClose,
  onChanged,
}: {
  customerId: number | null;
  picOptions: { id: number; name: string }[];
  groupOptions: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<GroupMemberDetail | null>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (customerId == null) {
      setDetail(null);
      setForm(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadGroupMemberDetailAction(customerId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setForm(result ? toForm(result) : null);
        }
      })
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : "Gagal memuat detail"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function save() {
    if (!customerId || !form) return;
    setSaving(true);
    setError(null);
    try {
      await editGroupMembershipAction(customerId, {
        groupName: form.groupName.trim() || null,
        joinedAt: form.joinedAt || null,
        picUserId: form.picUserId ? Number(form.picUserId) : null,
        notes: form.notes.trim() || null,
      });
      const result = await loadGroupMemberDetailAction(customerId);
      setDetail(result);
      setForm(result ? toForm(result) : null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!customerId) return;
    setRemoving(true);
    setError(null);
    try {
      await removeGroupMembershipAction(customerId);
      onClose();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengeluarkan member dari grup");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <DialogPrimitive.Root modal={false} open={customerId != null} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(event) => event.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-0 border-l bg-card",
            "shadow-[0_8px_40px_-12px_rgba(15,23,42,0.35)] outline-none sm:max-w-[30rem]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-300",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          )}
        >
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Tutup</span>
          </DialogPrimitive.Close>

          <SheetHeader className="border-b">
            <div className="pr-12">
              <SheetTitle className="text-base">Detail Member Grup</SheetTitle>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">No HP: {detail?.normalizedPhone ?? "—"}</p>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-5 text-xs">
            {loading || !detail || !form ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {error ?? "Memuat..."}
              </p>
            ) : (
              <>
                <Section icon={User} title="Data Customer">
                  <Row label="Nama Customer" value={detail.displayName} />
                  <Row label="No HP" value={detail.normalizedPhone} mono />
                  <Row label="Current Cluster" value={<Badge variant="outline">{clusterLabel(detail.clusterCode)}</Badge>} />
                  <Row label="Tanggal Pertama Beli" value={formatDate(detail.firstOrderDate)} />
                  <Row label="Total Transaksi" value={`${detail.frequency}×`} />
                  <Row label="Total Belanja" value={formatRupiah(detail.monetary)} />
                  <Row label="Last Order" value={formatDate(detail.lastOrderDate)} />
                </Section>

                <Section icon={UsersRound} title="Edit Informasi Grup">
                  <FormRow label="Nama Grup">
                    <Input list="group-membership-names" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} />
                    <datalist id="group-membership-names">
                      {groupOptions.map((name) => <option key={name} value={name} />)}
                    </datalist>
                  </FormRow>
                  <FormRow label="PIC">
                    <select className="h-9 w-full rounded-md border bg-card px-3 text-xs" value={form.picUserId} onChange={(e) => setForm({ ...form, picUserId: e.target.value })}>
                      <option value="">— Belum ditentukan —</option>
                      {picOptions.map((pic) => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="Tanggal Masuk Grup">
                    <Input type="date" value={form.joinedAt} onChange={(e) => setForm({ ...form, joinedAt: e.target.value })} />
                  </FormRow>
                  <FormRow label="Catatan">
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </FormRow>
                  <div className="flex justify-end pt-1">
                    <Button size="sm" onClick={save} disabled={saving || removing}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                      Simpan
                    </Button>
                  </div>
                  {error ? <p className="text-destructive">{error}</p> : null}
                </Section>

                <Section icon={Activity} title="Ringkasan Aktivitas">
                  <Row label="Last Order" value={formatDate(detail.lastOrderDate)} />
                  <Row label="Produk Terakhir" value={dash(detail.lastProductName)} />
                  <Row label="Channel Terakhir" value={dash(detail.lastOrderDivision)} />
                  <Row label="Sumber Update" value={GROUP_SOURCE_LABELS[detail.source]} />
                </Section>

                {detail.clusterReason ? (
                  <Section icon={Activity} title="Why this cluster?">
                    <p className="mb-2 text-muted-foreground">
                      Satu customer mendapat tepat satu cluster. Rule pertama yang cocok menang sesuai prioritas perusahaan.
                    </p>
                    <Row label="Rule terpilih" value={clusterLabel(detail.clusterCode)} />
                    {detail.clusterAsOfDate ? <Row label="Data as of" value={formatDate(detail.clusterAsOfDate)} /> : null}
                    {detail.clusterReason.checks.map((check, index) => (
                      <Row key={index} label={check.label} value={String(check.actual ?? "—")} />
                    ))}
                  </Section>
                ) : null}

                {detail.updatedAt ? (
                  <p className="border-t pt-3 text-[11px] text-muted-foreground">
                    Terakhir diperbarui {formatDate(detail.updatedAt)}{detail.updatedByName ? ` oleh ${detail.updatedByName}` : ""}.
                  </p>
                ) : null}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={saving || removing}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Keluarkan dari Grup
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Keluarkan {detail.displayName} dari grup?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Hanya membership grup yang diubah menjadi “Belum masuk grup”. Data customer dan seluruh transaksi tidak dihapus. Cluster dihitung ulang otomatis.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction onClick={remove}>Ya, Keluarkan</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </SheetBody>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-words text-right font-medium", mono && "font-mono")}>{value}</span>
    </div>
  );
}
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
