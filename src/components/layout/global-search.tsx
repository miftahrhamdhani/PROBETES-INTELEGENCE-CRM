"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Search, X } from "lucide-react";
import { searchCustomersQuickAction } from "@/app/customers-actions";
import { canAccessPath } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Result = { id: number; name: string; phone: string };

/**
 * Search global di header — cari customer (entitas paling sentral di sistem
 * ini) dari halaman MANAPUN, klik hasil langsung membuka detailnya di
 * /customers. Sengaja tidak meluas ke task/laporan di V1 (scope terkendali).
 *
 * Disembunyikan untuk role yang tidak berhak lihat PII customer (MANAGEMENT —
 * sama seperti /customers di roles.ts) supaya tidak ada kotak yang selalu
 * gagal dipakai; guard di searchCustomersQuickAction tetap jaring pengaman.
 */
export function GlobalSearch() {
  const router = useRouter();
  const role = useSession().data?.user?.role;
  const canSearch = canAccessPath(role, "/customers");

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const rows = await searchCustomersQuickAction(query.trim());
        if (!cancelled) {
          setResults(rows);
          setOpen(true);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  React.useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!canSearch) return null;

  function goTo(id: number) {
    setOpen(false);
    setQuery("");
    router.push(`/customers?customer=${id}`);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary-foreground/70 dark:text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        role="combobox"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results[0]) goTo(results[0].id);
        }}
        placeholder="Cari customer (nama/No HP)…"
        aria-label="Cari customer"
        aria-autocomplete="list"
        aria-controls="global-search-results"
        aria-expanded={open && query.trim().length >= 2}
        className={cn(
          "h-9 w-full rounded-md border bg-primary-foreground/10 pl-8 pr-8 text-xs text-primary-foreground placeholder:text-primary-foreground/60 outline-none transition-colors",
          "border-primary-foreground/25 focus:bg-primary-foreground/15 focus:border-primary-foreground/50",
          "dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:border-input dark:focus:bg-card"
        )}
      />
      {loading ? (
        <Loader2
          className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary-foreground/70 dark:text-muted-foreground"
          aria-hidden="true"
        />
      ) : query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults([]);
            setOpen(false);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary-foreground/70 hover:text-primary-foreground dark:text-muted-foreground dark:hover:text-foreground"
          aria-label="Bersihkan pencarian"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}

      {open && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Hasil pencarian customer"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-card text-card-foreground shadow-lg"
        >
          {results.length === 0 && !loading ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Tidak ada customer yang cocok.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => goTo(r.id)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-accent"
              >
                <span className="font-medium">{r.name}</span>
                <span className="tabular text-muted-foreground">{r.phone}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
