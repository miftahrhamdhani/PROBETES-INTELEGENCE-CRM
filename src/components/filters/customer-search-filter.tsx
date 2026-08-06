"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";
import { MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS } from "@/lib/membership-contracts";

const MEMBERSHIP_OPTIONS: { value: string; label: string }[] = MEMBERSHIP_STATUSES.map((value) => ({
  value,
  label: MEMBERSHIP_STATUS_LABELS[value],
}));
const MEMBERSHIP_OPTIONS_WITH_CONFLICT: { value: string; label: string }[] = [
  ...MEMBERSHIP_OPTIONS,
  { value: "CONFLICT", label: "Konflik (belum diselesaikan)" },
];

const CLUSTER_OPTIONS = [
  ...Object.entries(CLUSTER_LABELS),
  ...Object.entries(NON_CLUSTER_LABELS),
];

/**
 * Nama+HP digabung dalam satu kotak pencarian; CS, cluster, status grup, dan
 * PIC masing-masing filter tersendiri (bukan ikut digabung ke pencarian).
 */
export function CustomerSearchFilter({
  csOptions,
  picOptions = [],
  showCsFilter = true,
  showConflictOption = false,
}: {
  csOptions: string[];
  picOptions?: { id: number; name: string }[];
  /** Customer All punya filter CS; halaman Group Membership tidak relevan (sembunyikan). */
  showCsFilter?: boolean;
  /** Halaman Group Membership butuh pseudo-status "Konflik"; Customer All tidak. */
  showConflictOption?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");

  React.useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  // `startTransition`: tanpa ini, setiap filter berganti memicu `loading.tsx`
  // yang mengganti seluruh tabel dengan skeleton — padahal baris yang sedang
  // tampil masih valid untuk dilihat sampai hasil filter baru siap.
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => updateParam("search", search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama atau nomor HP"
          className="pl-8"
        />
      </label>
      {showCsFilter ? (
        <select
          aria-label="Filter CS"
          className="h-9 rounded-md border bg-card px-3 text-xs"
          value={searchParams.get("cs") ?? ""}
          onChange={(event) => updateParam("cs", event.target.value)}
        >
          <option value="">Semua CS</option>
          {csOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}
      <select
        aria-label="Filter Cluster"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("cluster") ?? ""}
        onChange={(event) => updateParam("cluster", event.target.value)}
      >
        <option value="">Semua Cluster</option>
        {CLUSTER_OPTIONS.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter Status Grup"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("membershipStatus") ?? ""}
        onChange={(event) => updateParam("membershipStatus", event.target.value)}
      >
        <option value="">Semua Status Grup</option>
        {(showConflictOption ? MEMBERSHIP_OPTIONS_WITH_CONFLICT : MEMBERSHIP_OPTIONS).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter PIC"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("pic") ?? ""}
        onChange={(event) => updateParam("pic", event.target.value)}
      >
        <option value="">Semua PIC</option>
        {picOptions.map((pic) => (
          <option key={pic.id} value={pic.name}>
            {pic.name}
          </option>
        ))}
      </select>
      <PendingIndicator show={isPending} />
    </div>
  );
}
