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

function toDate(value: string | null): Date | undefined {
  return value ? new Date(`${value}T00:00:00Z`) : undefined;
}

function toKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Satu komponen Date Range Picker (Popover + Calendar mode="range") dengan
 *  preset — dipakai Overview dan Pesanan (docs prompt §6.1/§7). `from`/`to`
 *  null berarti "Seluruh Data" (tanpa filter tanggal). */
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
  const range: DateRange | undefined = React.useMemo(() => ({ from: toDate(from), to: toDate(to) }), [from, to]);

  function applyPreset(preset: DateRangePreset) {
    if (preset === "CUSTOM") return;
    onChange(resolveDateRangePreset(preset));
    setOpen(false);
  }

  const label = from && to ? (from === to ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}`) : "Seluruh Data";

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
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            defaultMonth={range.from}
            onSelect={(next) => {
              if (!next) return;
              onChange({ from: next.from ? toKey(next.from) : null, to: next.to ? toKey(next.to) : next.from ? toKey(next.from) : null });
              if (next.from && next.to) setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
