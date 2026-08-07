"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_RANGE_PRESET_LABEL, DATE_RANGE_PRESETS, resolveDateRangePreset, type DateRangePreset } from "@/lib/workspace-date-presets";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * `YYYY-MM-DD` <-> Date memakai komponen tanggal LOKAL (bukan `new Date(iso)`
 * yang di-parse sebagai UTC). react-day-picker membandingkan hari memakai waktu
 * lokal browser, jadi tanggal yang dibangun dari UTC bisa tampil bergeser satu
 * hari di timezone offset negatif. Dua helper ini simetris: toKey(toDate(s)) === s.
 */
function toDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Date Range Picker — SATU kalender (bukan dua) dengan preset di sisi kiri.
 * Dipakai seluruh fitur Workspace (Overview, Pesanan, Pembagian Tugas, Biaya
 * Operasional). `from`/`to` null berarti "Seluruh Data" (tanpa filter tanggal).
 *
 * Cara pilih (sengaja sederhana, satu kalender saja):
 *  - klik 1× tanggal A  -> A jadi awal rentang (belum diterapkan)
 *  - klik 1× tanggal B  -> rentang A–B langsung diterapkan & popover tertutup
 *  - klik tanggal A lagi -> hanya tanggal A itu saja (rentang satu hari)
 *  - atau setelah klik pertama, tekan "Terapkan" untuk memakai satu hari itu saja
 *
 * Pilihan disimpan dulu sebagai state `pending` dan BARU dikirim lewat onChange
 * saat rentangnya lengkap — supaya klik pertama tidak memicu navigasi/refetch
 * dengan rentang setengah jadi.
 */
export function WorkspaceDateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const committed: DateRange | undefined = React.useMemo(() => {
    const start = toDate(from);
    return start ? { from: start, to: toDate(to) ?? start } : undefined;
  }, [from, to]);

  const [pending, setPending] = React.useState<DateRange | undefined>(committed);

  // Setiap popover dibuka, mulai lagi dari nilai yang sedang aktif — supaya
  // pilihan setengah jadi dari sesi sebelumnya tidak ikut terbawa.
  React.useEffect(() => {
    if (open) setPending(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function apply(range: DateRange | undefined) {
    if (!range?.from) onChange({ from: null, to: null });
    else onChange({ from: toKey(range.from), to: toKey(range.to ?? range.from) });
    setOpen(false);
  }

  function applyPreset(preset: DateRangePreset) {
    if (preset === "CUSTOM") return;
    const range = resolveDateRangePreset(preset);
    onChange(range);
    setOpen(false);
  }

  function handleDayClick(date: Date) {
    // Klik pertama (atau klik setelah rentang lengkap) selalu memulai rentang baru.
    if (!pending?.from || pending.to) {
      setPending({ from: date, to: undefined });
      return;
    }
    // Klik kedua: lengkapi rentang lalu langsung terapkan. Klik tanggal yang
    // sama = rentang satu hari.
    const next: DateRange = isSameDay(date, pending.from)
      ? { from: date, to: date }
      : date < pending.from
        ? { from: date, to: pending.from }
        : { from: pending.from, to: date };
    setPending(next);
    apply(next);
  }

  const label = from && to ? (from === to ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}`) : "Seluruh Data";
  const awaitingSecondClick = Boolean(pending?.from && !pending.to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn("justify-start gap-2 text-xs font-normal", className)}>
          <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-0.5 border-b p-1.5 sm:w-40 sm:border-b-0 sm:border-r">
            {DATE_RANGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {DATE_RANGE_PRESET_LABEL[preset]}
              </button>
            ))}
          </div>
          <div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={pending}
              onDayClick={handleDayClick}
              defaultMonth={pending?.from ?? committed?.from ?? new Date()}
            />
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {awaitingSecondClick ? "Pilih tanggal akhir, atau Terapkan untuk satu hari" : "Klik tanggal awal"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-sm px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setPending(undefined);
                    apply(undefined);
                  }}
                >
                  Reset
                </button>
                <Button type="button" size="sm" className="h-7 text-[11px]" disabled={!pending?.from} onClick={() => apply(pending)}>
                  Terapkan
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
