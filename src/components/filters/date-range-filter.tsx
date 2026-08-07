"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { cn } from "@/lib/utils";

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function fromKey(value: string): Date {
  const parts = value.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}
function formatLabel(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isSameRange(a: DateRange | undefined, b: DateRange): boolean {
  if (!a?.from || !a.to) return false;
  return isSameDay(a.from, b.from!) && isSameDay(a.to, b.to!);
}
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type Preset = { label: string; range: () => DateRange };

function buildPresets(): Preset[] {
  const today = startOfDay(new Date());
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  return [
    { label: "Hari ini", range: () => ({ from: today, to: today }) },
    { label: "7 Hari Terakhir", range: () => ({ from: daysAgo(6), to: today }) },
    { label: "30 Hari Terakhir", range: () => ({ from: daysAgo(29), to: today }) },
    { label: "Bulan Ini", range: () => ({ from: new Date(today.getFullYear(), today.getMonth(), 1), to: today }) },
    {
      label: "Bulan Lalu",
      range: () => {
        const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const to = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from, to };
      },
    },
    { label: "Tahun Ini", range: () => ({ from: new Date(today.getFullYear(), 0, 1), to: today }) },
  ];
}

/**
 * Filter rentang tanggal dengan preset (Hari ini/7 Hari/30 Hari/Bulan Ini/Bulan
 * Lalu/Tahun Ini/Custom) — dipakai konsisten di semua halaman berbasis tabel
 * (Customers, Group Membership, CRM Report). Untuk V1, rentang ini HANYA
 * membatasi tampilan tabel/daftar (docs/07-OPEN-QUESTIONS.md Q16) — tidak pernah
 * mengubah as_of_date atau perhitungan RFM/Cohort/Cluster yang sudah tervalidasi.
 */
export function DateRangeFilter({ paramFrom = "from", paramTo = "to" }: { paramFrom?: string; paramTo?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [navPending, startNavTransition] = React.useTransition();
  const presets = React.useMemo(buildPresets, []);

  const urlFrom = searchParams.get(paramFrom);
  const urlTo = searchParams.get(paramTo);
  const committed: DateRange | undefined = urlFrom
    ? { from: fromKey(urlFrom), to: urlTo ? fromKey(urlTo) : undefined }
    : undefined;

  const [pending, setPending] = React.useState<DateRange | undefined>(committed);

  React.useEffect(() => {
    if (open) setPending(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Satu kalender, dua klik — perilaku IDENTIK dengan WorkspaceDateRangePicker
   * (src/components/ui/date-range-picker.tsx) supaya rentang tanggal terasa
   * sama di seluruh aplikasi: klik 1× = tanggal awal, klik 1× lagi = rentang
   * lengkap dan langsung diterapkan, klik tanggal yang sama = rentang satu hari.
   */
  function handleDayClick(date: Date) {
    if (!pending?.from || pending.to) {
      setPending({ from: date, to: undefined });
      return;
    }
    const next: DateRange = isSameDay(date, pending.from)
      ? { from: date, to: date }
      : date < pending.from
        ? { from: date, to: pending.from }
        : { from: pending.from, to: date };
    setPending(next);
    applyAndClose(next);
  }

  function applyAndClose(range: DateRange | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (range?.from) {
      params.set(paramFrom, toKey(range.from));
      params.set(paramTo, toKey(range.to ?? range.from));
    } else {
      params.delete(paramFrom);
      params.delete(paramTo);
    }
    params.delete("page");
    // startTransition: jangan biarkan `loading.tsx` mengganti seluruh tabel
    // saat rentang tanggal berubah — data lama tetap valid sampai data baru siap.
    startNavTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
    setOpen(false);
  }

  const label = committed?.from
    ? `${formatLabel(committed.from)} – ${formatLabel(committed.to ?? committed.from)}`
    : "Pilih rentang tanggal";

  return (
    <div className="flex items-center gap-2">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs transition-colors hover:bg-accent"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col gap-0.5 border-r p-2">
            {presets.map((preset) => {
              const range = preset.range();
              const active = isSameRange(pending, range);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                  onClick={() => {
                    setPending(range);
                    applyAndClose(range);
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={pending}
              onDayClick={handleDayClick}
              defaultMonth={pending?.from ?? new Date()}
            />
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {pending?.from && !pending.to ? "Pilih tanggal akhir, atau Terapkan untuk satu hari" : "Klik tanggal awal"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-sm px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setPending(undefined);
                    applyAndClose(undefined);
                  }}
                >
                  Reset
                </button>
                <Button size="sm" className="h-7 text-[11px]" onClick={() => applyAndClose(pending)} disabled={!pending?.from}>
                  Terapkan
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <PendingIndicator show={navPending} />
    </div>
  );
}
