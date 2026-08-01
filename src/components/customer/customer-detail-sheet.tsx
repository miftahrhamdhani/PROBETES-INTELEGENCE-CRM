"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Archive, ArchiveRestore, CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  loadCustomerDetail,
  loadCustomerProfileHistory,
  setCustomerArchivedAction,
  updateCustomerMembership,
  updateCustomerProfileAction,
} from "@/app/customers-actions";
import { createManualTaskAction, loadCustomerTaskHistoryAction } from "@/app/workspace-actions";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { canAccessPath } from "@/lib/roles";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import type { CustomerDetail, CustomerProfileHistoryEntry } from "@/lib/customer-types";
import {
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  type MembershipStatusValue,
} from "@/lib/membership-contracts";
import { cn } from "@/lib/utils";
import {
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
  type CrmTaskType,
} from "@/lib/workspace-contracts";
import type { CustomerTaskHistoryRow } from "@/lib/workspace-types";

function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "Belum ditentukan";
  return (CLUSTER_LABELS as Record<string, string>)[code] ?? (NON_CLUSTER_LABELS as Record<string, string>)[code] ?? code;
}
function formatRupiah(value: string | null | undefined): string {
  if (value == null) return "—";
  return `Rp ${BigInt(value).toLocaleString("id-ID")}`;
}
function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`)
  );
}
const MEMBERSHIP_VARIANT: Record<MembershipStatusValue, "success" | "outline" | "warning"> = {
  GROUPED: "success",
  NOT_GROUPED: "outline",
  UNKNOWN: "warning",
};

interface MembershipForm {
  status: MembershipStatusValue;
  groupName: string;
  joinedAt: string;
  picUserId: string;
  notes: string;
}

function formFromDetail(detail: CustomerDetail): MembershipForm {
  return {
    status: detail.membership.status,
    groupName: detail.membership.groupName ?? "",
    joinedAt: detail.membership.joinedAt ?? "",
    picUserId: detail.membership.picUserId != null ? String(detail.membership.picUserId) : "",
    notes: detail.membership.notes ?? "",
  };
}

interface ProfileForm {
  name: string;
  address: string;
  phone: string;
}

function profileFromDetail(detail: CustomerDetail): ProfileForm {
  return {
    name: detail.displayName === "(tanpa nama)" ? "" : detail.displayName,
    address: detail.address ?? "",
    phone: detail.displayPhone ?? detail.normalizedPhone,
  };
}

const PROFILE_FIELD_LABELS: Record<"name" | "address" | "phone", string> = {
  name: "Nama",
  address: "Alamat",
  phone: "No HP",
};

/**
 * Dikendalikan lewat query param `?customer=<id>` — supaya bisa dibuka
 * langsung dari mana pun (baris tabel drill-down, link, dsb) tanpa state
 * lokal terpisah per halaman.
 */
export function CustomerDetailSheet({
  paramName = "customer",
  picOptions = [],
}: {
  paramName?: string;
  picOptions?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useSession().data?.user?.role;
  const canEdit = canAccessPath(role, "/customers");
  const customerIdRaw = searchParams.get(paramName);
  const customerId = customerIdRaw ? Number(customerIdRaw) : null;

  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState<MembershipForm | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const [profileForm, setProfileForm] = React.useState<ProfileForm | null>(null);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = React.useState(false);
  const [phoneConfirmOpen, setPhoneConfirmOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  const [profileHistory, setProfileHistory] = React.useState<CustomerProfileHistoryEntry[]>([]);
  const [taskHistory, setTaskHistory] = React.useState<CustomerTaskHistoryRow[]>([]);
  const [taskHistoryLoading, setTaskHistoryLoading] = React.useState(false);

  const fetchProfileHistory = React.useCallback((id: number) => {
    return loadCustomerProfileHistory(id)
      .then((result) => setProfileHistory(result))
      .catch(() => {});
  }, []);

  const fetchTaskHistory = React.useCallback((id: number) => {
    setTaskHistoryLoading(true);
    return loadCustomerTaskHistoryAction(id)
      .then((result) => setTaskHistory(result))
      .finally(() => setTaskHistoryLoading(false));
  }, []);

  const fetchDetail = React.useCallback((id: number) => {
    setLoading(true);
    return loadCustomerDetail(id).then((result) => {
      setDetail(result);
      setForm(result ? formFromDetail(result) : null);
      setProfileForm(result ? profileFromDetail(result) : null);
      setLoading(false);
      return result;
    });
  }, []);

  React.useEffect(() => {
    if (!customerId) {
      setDetail(null);
      setForm(null);
      setProfileForm(null);
      setTaskHistory([]);
      setProfileHistory([]);
      return;
    }
    let cancelled = false;
    setSaveError(null);
    setSaveSuccess(false);
    setProfileError(null);
    setProfileSuccess(false);
    setPhoneConfirmOpen(false);
    setArchiveError(null);
    fetchDetail(customerId).then((result) => {
      if (cancelled) return;
      void result;
    });
    fetchTaskHistory(customerId);
    fetchProfileHistory(customerId);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramName);
    const query = params.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  }

  async function handleSave() {
    if (!customerId || !form) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateCustomerMembership(customerId, {
        status: form.status,
        groupName: form.groupName.trim() || null,
        joinedAt: form.joinedAt || null,
        picUserId: form.picUserId ? Number(form.picUserId) : null,
        notes: form.notes.trim() || null,
      });
      await fetchDetail(customerId);
      setSaveSuccess(true);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  }

  function phoneChanged(): boolean {
    if (!profileForm || !detail) return false;
    return profileForm.phone.trim() !== (detail.displayPhone ?? detail.normalizedPhone).trim();
  }

  /** No HP adalah identitas customer — kalau berubah, minta konfirmasi eksplisit
   *  dulu (lihat AlertDialog di render) sebelum benar-benar menyimpan. */
  function handleSaveProfileClick() {
    if (phoneChanged()) {
      setPhoneConfirmOpen(true);
      return;
    }
    doSaveProfile();
  }

  async function doSaveProfile() {
    if (!customerId || !profileForm) return;
    setPhoneConfirmOpen(false);
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      await updateCustomerProfileAction(customerId, {
        name: profileForm.name.trim() || undefined,
        address: profileForm.address.trim() || null,
        phone: profileForm.phone.trim() || undefined,
      });
      await fetchDetail(customerId);
      fetchProfileHistory(customerId);
      setProfileSuccess(true);
      router.refresh();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Gagal menyimpan profil");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleToggleArchive(archived: boolean) {
    if (!customerId) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await setCustomerArchivedAction(customerId, archived);
      await fetchDetail(customerId);
      router.refresh();
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Gagal mengubah status arsip");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Sheet open={!!customerId} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        {loading || !detail || !form ? (
          <DetailSkeleton />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{detail.displayName}</SheetTitle>
              <SheetDescription>
                {detail.displayPhone ?? detail.normalizedPhone} · {detail.normalizedPhone}
              </SheetDescription>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge>{clusterLabel(detail.clusterCode)}</Badge>
                <Badge variant={MEMBERSHIP_VARIANT[detail.membership.status]}>
                  {MEMBERSHIP_STATUS_LABELS[detail.membership.status]}
                </Badge>
                {detail.yaconaFrequency > 0 ? (
                  <Badge variant="outline">Yacona/KSB {detail.yaconaFrequency}×</Badge>
                ) : null}
                {detail.archivedAt ? <Badge variant="warning">Diarsipkan</Badge> : null}
              </div>
            </SheetHeader>

            <SheetBody className="space-y-5">
              <section className="grid grid-cols-3 gap-2">
                <Metric label="Recency" value={detail.recencyDays != null ? `${detail.recencyDays} hari` : "—"} />
                <Metric label="Frequency" value={`${detail.frequency}×`} />
                <Metric label="Monetary" value={formatRupiah(detail.monetary)} />
              </section>

              <section className="grid grid-cols-2 gap-3 text-xs">
                <Field label="First order" value={formatDate(detail.firstOrderDate)} />
                <Field label="Last order" value={formatDate(detail.lastOrderDate)} />
                <Field label="Cohort" value={detail.cohortMonth ?? "—"} />
                <Field label="AOV" value={formatRupiah(detail.avgOrderValue)} />
              </section>

              {canEdit && profileForm ? (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profil Customer</h3>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={archiving}>
                          {detail.archivedAt ? (
                            <>
                              <ArchiveRestore className="h-3.5 w-3.5" /> Aktifkan
                            </>
                          ) : (
                            <>
                              <Archive className="h-3.5 w-3.5" /> Arsipkan
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{detail.archivedAt ? "Aktifkan kembali customer ini?" : "Arsipkan customer ini?"}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {detail.archivedAt
                              ? "Customer akan muncul kembali di daftar Customers/Group Membership."
                              : "Customer akan disembunyikan dari daftar Customers/Group Membership. RFM, Cohort, Frequency, dan Cluster TIDAK berubah — data transaksi tetap dihitung penuh."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleToggleArchive(!detail.archivedAt)}>
                            {detail.archivedAt ? "Aktifkan" : "Arsipkan"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <FormRow label="Nama">
                      <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Nama customer" />
                    </FormRow>
                    <FormRow label="No HP">
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="mis. 0812xxxxxxx"
                      />
                    </FormRow>
                    <FormRow label="Alamat">
                      <Textarea value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="Opsional" />
                    </FormRow>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-[11px] text-muted-foreground">Koreksi data salah input — bukan transaksi baru.</p>
                      <Button size="sm" onClick={handleSaveProfileClick} disabled={profileSaving}>
                        {profileSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                        Simpan
                      </Button>
                    </div>
                    {profileError ? <p className="text-[11px] text-destructive">{profileError}</p> : null}
                    {archiveError ? <p className="text-[11px] text-destructive">{archiveError}</p> : null}
                    {profileSuccess ? <p className="text-[11px] text-green-600 dark:text-green-400">Profil tersimpan.</p> : null}
                  </div>

                  <AlertDialog open={phoneConfirmOpen} onOpenChange={setPhoneConfirmOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ubah No HP customer ini?</AlertDialogTitle>
                        <AlertDialogDescription>
                          No HP adalah identitas customer — seluruh riwayat order, cluster, dan membership tetap
                          menempel di customer yang sama (tidak hilang/pindah). Pastikan ini murni koreksi salah
                          input, bukan customer yang berbeda. Nomor baru tidak boleh sudah dipakai customer lain.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={doSaveProfile}>Ya, Simpan Perubahan</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {profileHistory.length > 0 ? (
                    <div className="mt-3">
                      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Riwayat Perubahan Data
                      </h4>
                      <div className="space-y-1 text-xs">
                        {profileHistory.map((h) => (
                          <div key={h.id} className="rounded-md border px-3 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{PROFILE_FIELD_LABELS[h.field]}</span>
                              <span className="text-muted-foreground">{formatDate(h.changedAt.slice(0, 10))}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {(h.oldValue ?? "—")} → {(h.newValue ?? "—")}
                              {h.changedByName ? ` · ${h.changedByName}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  CRM Enrichment
                </h3>
                <div className="space-y-2 rounded-md border p-3">
                  <FormRow label="Status Grup">
                    <select
                      className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as MembershipStatusValue })}
                    >
                      {MEMBERSHIP_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {MEMBERSHIP_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </FormRow>
                  <FormRow label="Nama Grup">
                    <Input
                      value={form.groupName}
                      onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                      placeholder="mis. Grup WA Probetes Jakarta"
                    />
                  </FormRow>
                  <FormRow label="Tanggal Masuk">
                    <Input
                      type="date"
                      value={form.joinedAt}
                      onChange={(e) => setForm({ ...form, joinedAt: e.target.value })}
                    />
                  </FormRow>
                  <FormRow label="PIC / CRM">
                    <select
                      className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                      value={form.picUserId}
                      onChange={(e) => setForm({ ...form, picUserId: e.target.value })}
                    >
                      <option value="">— Belum ditentukan —</option>
                      {picOptions.map((pic) => (
                        <option key={pic.id} value={pic.id}>
                          {pic.name}
                        </option>
                      ))}
                    </select>
                  </FormRow>
                  <FormRow label="Catatan">
                    <textarea
                      className="min-h-16 w-full rounded-md border bg-card px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Catatan internal CRM"
                    />
                  </FormRow>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      {detail.membership.updatedAt
                        ? `Terakhir diubah ${formatDate(detail.membership.updatedAt.slice(0, 10))}${
                            detail.membership.updatedByName ? ` oleh ${detail.membership.updatedByName}` : ""
                          }`
                        : "Belum pernah diubah manual"}
                    </p>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                      Simpan
                    </Button>
                  </div>
                  {saveError ? <p className="text-[11px] text-destructive">{saveError}</p> : null}
                  {saveSuccess ? (
                    <p className="text-[11px] text-green-600 dark:text-green-400">
                      Tersimpan — cluster sudah dihitung ulang.
                    </p>
                  ) : null}
                </div>
              </section>

              {detail.reason ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Why this cluster?
                  </h3>
                  <div className="space-y-1 rounded-md border p-3">
                    <p className="mb-2 text-xs">
                      Rule <span className="font-medium">{clusterLabel(detail.reason.matchedRule as ClusterAssignmentCode)}</span>
                      {detail.clusterAsOfDate ? ` · as of ${formatDate(detail.clusterAsOfDate)}` : ""}
                    </p>
                    {detail.reason.checks.map((check, index) => (
                      <div key={index} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {check.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                          )}
                          {check.label}
                        </span>
                        <span className="tabular font-medium">{String(check.actual)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.clusterHistory.length > 1 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Riwayat cluster
                  </h3>
                  <div className="space-y-1 text-xs">
                    {detail.clusterHistory.map((h, index) => (
                      <div key={index} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                        <span className="font-medium">{clusterLabel(h.clusterCode as ClusterAssignmentCode)}</span>
                        <span className="text-muted-foreground">
                          {formatDate(h.validFrom.slice(0, 10))} – {h.validTo ? formatDate(h.validTo.slice(0, 10)) : "sekarang"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.membershipHistory.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Riwayat status grup
                  </h3>
                  <div className="space-y-1 text-xs">
                    {detail.membershipHistory.map((h, index) => (
                      <div key={index} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                        <span className="font-medium">
                          {h.oldStatus ? `${MEMBERSHIP_STATUS_LABELS[h.oldStatus as MembershipStatusValue] ?? h.oldStatus} → ` : ""}
                          {MEMBERSHIP_STATUS_LABELS[h.newStatus as MembershipStatusValue] ?? h.newStatus}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {formatDate(h.changedAt.slice(0, 10))}
                          {h.changedByName ? ` · ${h.changedByName}` : h.source === "CRM_MANUAL" ? " · CRM" : " · import"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {canEdit ? (
                <CrmTaskHistorySection
                  customerId={detail.customerId}
                  history={taskHistory}
                  loading={taskHistoryLoading}
                  onCreated={() => fetchTaskHistory(detail.customerId)}
                />
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timeline transaksi ({detail.orders.length})
                </h3>
                <div className="space-y-2">
                  {detail.orders.map((order) => (
                    <div key={order.orderId} className="rounded-md border p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{formatDate(order.orderDate)}</span>
                        <span className="font-semibold tabular">{formatRupiah(order.orderTotal)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[order.platform, order.paymentMethod, order.csName].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <div className="mt-2 space-y-1">
                        {order.items.map((item, index) => (
                          <div key={index} className={cn("flex items-center justify-between", item.isBonus && "text-muted-foreground")}>
                            <span>
                              {item.rawProductName}
                              {item.isBonus ? " (bonus)" : ""}
                            </span>
                            <span className="tabular">{formatRupiah(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {detail.orders.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-center text-muted-foreground">
                      Tidak ada order Probetes tercatat.
                    </p>
                  ) : null}
                </div>
              </section>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Riwayat CRM — gabungan task Workspace (follow-up/broadcast/invite/dst) milik
 * customer ini, terbaru dulu. Tombol "+ Tugas" membuat task manual (mis. follow-up
 * ulang di luar deteksi customer baru otomatis) — lihat CLAUDE.md §8: repeat
 * follow-up wajib lewat task type terpisah, bukan otomatis dari import.
 */
function CrmTaskHistorySection({
  customerId,
  history,
  loading,
  onCreated,
}: {
  customerId: number;
  history: CustomerTaskHistoryRow[];
  loading: boolean;
  onCreated: () => void;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [taskType, setTaskType] = React.useState<CrmTaskType>("FOLLOW_UP_REPEAT");
  const [dueAt, setDueAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createManualTaskAction({ customerId, taskType, dueAt: dueAt || null, notes: notes.trim() || null });
      setFormOpen(false);
      setDueAt("");
      setNotes("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Riwayat CRM</h3>
        <Button size="sm" variant="outline" onClick={() => setFormOpen((v) => !v)}>
          + Tugas
        </Button>
      </div>

      {formOpen ? (
        <form onSubmit={handleCreate} className="mb-2 space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Jenis Tugas</Label>
              <select
                className="h-9 w-full rounded-md border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as CrmTaskType)}
              >
                {CRM_TASK_TYPES.filter((t) => t !== "FOLLOW_UP_NEW_CUSTOMER").map((t) => (
                  <option key={t} value={t}>
                    {CRM_TASK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Due Date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Catatan</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Buat Tugas
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <Skeleton className="h-16 rounded-md" />
      ) : history.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada task CRM untuk customer ini.</p>
      ) : (
        <div className="space-y-1.5">
          {history.map((task) => (
            <div key={task.id} className="rounded-md border px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{CRM_TASK_TYPE_LABELS[task.taskType]}</span>
                <span className="text-muted-foreground">{formatDate((task.completedAt ?? task.dueAt ?? task.createdAt).slice(0, 10))}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                PIC: {task.picName ?? "—"} · {CRM_TASK_STATUS_LABELS[task.status]}
                {task.outcome ? ` · Outcome: ${CRM_TASK_OUTCOME_LABELS[task.outcome]}` : ""}
              </p>
              {task.notes ? <p className="mt-0.5 text-[11px] text-muted-foreground">{task.notes}</p> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-2 border-b px-5 py-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </div>
      <div className="space-y-5 px-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
        </div>
        <Skeleton className="h-28 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular">{value}</p>
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
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
