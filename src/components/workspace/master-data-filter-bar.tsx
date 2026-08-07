"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListFilter, Plus, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ALL = "__ALL__";
const ADVANCED_KEYS = ["minPrice", "maxPrice", "minHpp", "maxHpp", "alias", "used", "createdFrom", "createdTo", "updatedFrom", "updatedTo"] as const;
type AdvancedKey = (typeof ADVANCED_KEYS)[number];

type AdvancedState = Record<AdvancedKey, string>;
const emptyAdvanced = (): AdvancedState => Object.fromEntries(ADVANCED_KEYS.map((key) => [key, ""])) as AdvancedState;

function LabeledField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-600", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function MasterProductFilterBar({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [advanced, setAdvanced] = React.useState<AdvancedState>(() =>
    Object.fromEntries(ADVANCED_KEYS.map((key) => [key, searchParams.get(key) ?? ""])) as AdvancedState
  );

  React.useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);

  const navigate = React.useCallback(
    (patch: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value && value !== ALL) params.set(key, value);
        else params.delete(key);
      });
      if (!("page" in patch)) params.delete("page");
      const href = `${pathname}${params.size ? `?${params}` : ""}`;
      startTransition(() => (replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (current === search) return;
    const timeout = window.setTimeout(() => navigate({ search: search || null }, true), 350);
    return () => window.clearTimeout(timeout);
  }, [navigate, search, searchParams]);

  function applyAdvanced() {
    navigate(Object.fromEntries(ADVANCED_KEYS.map((key) => [key, advanced[key] || null])));
    setAdvancedOpen(false);
  }

  function resetAdvanced() {
    setAdvanced(emptyAdvanced());
    navigate(Object.fromEntries(ADVANCED_KEYS.map((key) => [key, null])));
    setAdvancedOpen(false);
  }

  const advancedCount = ADVANCED_KEYS.filter((key) => searchParams.has(key)).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <LabeledField label="Cari produk" className="flex-1 xl:max-w-sm">
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Product ID atau nama produk..."
              aria-label="Cari produk"
              className="h-9 pl-9"
            />
          </span>
        </LabeledField>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-end">
          <LabeledField label="Jenis Produk" className="xl:w-48">
            <Select value={searchParams.get("productUsage") ?? ALL} onValueChange={(value) => navigate({ productUsage: value === ALL ? null : value })}>
              <SelectTrigger aria-label="Jenis Produk"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua</SelectItem>
                <SelectItem value="SELLABLE">Sellable</SelectItem>
                <SelectItem value="BONUS_ONLY">Bonus Only</SelectItem>
                <SelectItem value="SELLABLE_AND_BONUS">Sellable + Bonus</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Status" className="xl:w-44">
            <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => navigate({ status: value === ALL ? null : value, includeInactive: null })}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="INACTIVE">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-1 xl:ml-auto">
            <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2 whitespace-nowrap">
                  <ListFilter className="h-4 w-4" aria-hidden="true" /> Filter Lanjutan
                  {advancedCount ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{advancedCount}</span> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,540px)] p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold">Filter Lanjutan</p>
                  <p className="text-xs text-muted-foreground">Saring harga, penggunaan, alias, dan tanggal produk.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RangeInputs label="Rentang Harga Jual" minValue={advanced.minPrice} maxValue={advanced.maxPrice} onMin={(value) => setAdvanced((state) => ({ ...state, minPrice: value }))} onMax={(value) => setAdvanced((state) => ({ ...state, maxPrice: value }))} />
                  <RangeInputs label="Rentang HPP" minValue={advanced.minHpp} maxValue={advanced.maxHpp} onMin={(value) => setAdvanced((state) => ({ ...state, minHpp: value }))} onMax={(value) => setAdvanced((state) => ({ ...state, maxHpp: value }))} />
                  <LabeledField label="Alias">
                    <Select value={advanced.alias || ALL} onValueChange={(value) => setAdvanced((state) => ({ ...state, alias: value === ALL ? "" : value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Semua</SelectItem><SelectItem value="HAS_ALIAS">Memiliki Alias</SelectItem><SelectItem value="NO_ALIAS">Tidak Memiliki Alias</SelectItem></SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="Penggunaan">
                    <Select value={advanced.used || ALL} onValueChange={(value) => setAdvanced((state) => ({ ...state, used: value === ALL ? "" : value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={ALL}>Semua</SelectItem><SelectItem value="USED">Pernah Digunakan</SelectItem><SelectItem value="UNUSED">Belum Pernah Digunakan</SelectItem></SelectContent>
                    </Select>
                  </LabeledField>
                  <DateInputs label="Tanggal Produk Dibuat" from={advanced.createdFrom} to={advanced.createdTo} onFrom={(value) => setAdvanced((state) => ({ ...state, createdFrom: value }))} onTo={(value) => setAdvanced((state) => ({ ...state, createdTo: value }))} />
                  <DateInputs label="Terakhir Diperbarui" from={advanced.updatedFrom} to={advanced.updatedTo} onFrom={(value) => setAdvanced((state) => ({ ...state, updatedFrom: value }))} onTo={(value) => setAdvanced((state) => ({ ...state, updatedTo: value }))} />
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={resetAdvanced}><RotateCcw className="h-3.5 w-3.5" /> Reset Filter Lanjutan</Button>
                  <Button type="button" size="sm" onClick={applyAdvanced}>Terapkan Filter</Button>
                </div>
              </PopoverContent>
            </Popover>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={isPending} onClick={() => startTransition(() => router.refresh())} aria-label="Perbarui data">
                    <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Perbarui data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {canCreate ? <Button type="button" size="sm" className="h-9 gap-1.5 whitespace-nowrap" onClick={onCreate}><Plus className="h-4 w-4" /> Produk Baru</Button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeInputs({ label, minValue, maxValue, onMin, onMax }: { label: string; minValue: string; maxValue: string; onMin: (value: string) => void; onMax: (value: string) => void }) {
  return <LabeledField label={label}><span className="flex items-center gap-2"><Input type="number" min={0} value={minValue} onChange={(event) => onMin(event.target.value)} placeholder="Minimum" /><span className="text-muted-foreground">–</span><Input type="number" min={0} value={maxValue} onChange={(event) => onMax(event.target.value)} placeholder="Maksimum" /></span></LabeledField>;
}

function DateInputs({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  return <LabeledField label={label}><span className="flex items-center gap-2"><Input type="date" value={from} onChange={(event) => onFrom(event.target.value)} /><span className="text-muted-foreground">–</span><Input type="date" value={to} onChange={(event) => onTo(event.target.value)} /></span></LabeledField>;
}
