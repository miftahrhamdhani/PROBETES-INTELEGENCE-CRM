"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";

const CLUSTER_OPTIONS = [...Object.entries(CLUSTER_LABELS), ...Object.entries(NON_CLUSTER_LABELS)];

/**
 * Filter Group Membership. Seluruhnya server-side lewat URL searchParams —
 * halaman membaca ulang dan query di backend yang menyaring, bukan array di browser.
 *
 * Rentang tanggal di sini adalah TANGGAL MASUK GRUP (`joined_at`), bukan tanggal
 * order — sengaja tidak memakai DateRangeFilter global yang memfilter order.
 */
export function GroupMemberFilterBar({
  picOptions,
  groupOptions,
}: {
  picOptions: { id: number; name: string }[];
  groupOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");

  React.useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  const updateParam = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => updateParam("search", search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Cari nama atau nomor HP" className="min-w-56 flex-1">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nama customer atau nomor HP..."
            className="pl-8"
          />
        </label>
      </Field>

      <Field label="Cluster">
        <Select value={searchParams.get("cluster") ?? ""} onChange={(v) => updateParam("cluster", v)} ariaLabel="Filter Cluster">
          <option value="">Semua Cluster</option>
          {CLUSTER_OPTIONS.map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Grup Konsultasi">
        <Select value={searchParams.get("groupName") ?? ""} onChange={(v) => updateParam("groupName", v)} ariaLabel="Filter Grup Konsultasi">
          <option value="">Semua Grup</option>
          {groupOptions.map((nama) => (
            <option key={nama} value={nama}>{nama}</option>
          ))}
        </Select>
      </Field>

      <Field label="PIC">
        <Select value={searchParams.get("pic") ?? ""} onChange={(v) => updateParam("pic", v)} ariaLabel="Filter PIC">
          <option value="">Semua PIC</option>
          {picOptions.map((pic) => (
            <option key={pic.id} value={pic.name}>{pic.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Rentang Tanggal Masuk Grup">
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="Tanggal masuk grup dari"
            className="h-9 w-[8.5rem]"
            value={searchParams.get("joinedFrom") ?? ""}
            onChange={(e) => updateParam("joinedFrom", e.target.value)}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Tanggal masuk grup sampai"
            className="h-9 w-[8.5rem]"
            value={searchParams.get("joinedTo") ?? ""}
            onChange={(e) => updateParam("joinedTo", e.target.value)}
          />
        </div>
      </Field>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
      </Button>
      <PendingIndicator show={isPending} />
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="h-9 rounded-md border bg-card px-3 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
