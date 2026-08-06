"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Searchable single-select tanpa dependency `cmdk` — Popover + input filter
 * manual. Dipakai untuk kombobox Produk/Nama CRM (docs prompt §6.3.3/§6.3.5):
 * hanya bisa memilih dari `options`, tidak bisa mengetik bebas.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  notFoundText = "Tidak ditemukan.",
  disabled,
  className,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  notFoundText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = query.trim()
    ? options.filter((option) => option.label.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")))
    : options;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-background px-2.5 text-[11px] outline-none",
            "focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 w-full rounded-sm border border-transparent bg-muted/50 px-2 text-xs outline-none focus:border-input"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{notFoundText}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent",
                  option.value === value && "bg-accent/70"
                )}
              >
                <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? <span className="block truncate text-[10px] text-muted-foreground">{option.description}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
