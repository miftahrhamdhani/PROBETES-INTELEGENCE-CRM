"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PendingIndicator } from "@/components/ui/pending-indicator";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * Pagination server-side untuk seluruh tabel besar (Pesanan, Biaya Operasional,
 * Master Data, Customers, History, Data Quality).
 *
 * Client Component (butuh `useTransition`/`useRouter`) — jadi pemanggil (Server
 * Component) TIDAK BOLEH mengirim closure (`hrefForPage={(n) => ...}`) sebagai
 * prop; React melarang fungsi melintasi batas server->client. Sebagai
 * gantinya props di sini adalah STRING href yang SUDAH dihitung di server:
 * `prevHref`/`nextHref` (null = tombol nonaktif) dan `perPageHrefs` (map ukuran
 * halaman -> href).
 *
 * Tetap dirender sebagai `<Link>` (accessible: klik kanan/buka tab baru/
 * keyboard/no-JS semuanya bekerja apa adanya, dan Next.js tetap prefetch
 * route-nya) — tapi klik kiri biasa di-intercept untuk memakai
 * `startTransition(() => router.push(...))`. Tanpa ini, tiap klik
 * Sebelumnya/Berikutnya memicu `loading.tsx` yang mengganti seluruh tabel
 * dengan skeleton, padahal baris yang sedang tampil masih valid dilihat
 * sampai halaman berikutnya siap.
 *
 * `label` menyebut satuan barisnya ("pesanan", "biaya", ...) — jangan dibiarkan
 * default kalau halamannya punya satuan yang jelas, karena teks ini yang dibaca
 * operator untuk memastikan filternya benar.
 */
export function Pagination({
  page,
  perPage,
  total,
  prevHref,
  nextHref,
  perPageHrefs,
  label = "baris",
}: {
  page: number;
  perPage: number;
  total: number;
  /** href halaman sebelumnya, atau `null` kalau sudah di halaman pertama. */
  prevHref: string | null;
  /** href halaman berikutnya, atau `null` kalau sudah di halaman terakhir. */
  nextHref: string | null;
  /** Kalau diisi, selector jumlah baris per halaman ikut ditampilkan. */
  perPageHrefs?: Partial<Record<(typeof PAGE_SIZE_OPTIONS)[number], string>>;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const totalPages = Math.max(Math.ceil(total / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const to = Math.min(currentPage * perPage, total);

  const navigate = React.useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router]
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} {label}
      </p>
      <div className="flex items-center gap-2">
        {perPageHrefs ? (
          <span className="flex items-center gap-1">
            <span>Baris</span>
            {PAGE_SIZE_OPTIONS.map((size) => {
              const href = perPageHrefs[size];
              if (!href) return null;
              return (
                <TransitionLink
                  key={size}
                  href={href}
                  onNavigate={navigate}
                  aria-current={size === perPage ? "true" : undefined}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 tabular",
                    size === perPage ? "border-foreground/30 bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {size}
                </TransitionLink>
              );
            })}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <PageLink href={prevHref} onNavigate={navigate}>
            Sebelumnya
          </PageLink>
          <span className="px-2 tabular">
            {currentPage} / {totalPages}
          </span>
          <PageLink href={nextHref} onNavigate={navigate}>
            Berikutnya
          </PageLink>
        </span>
        <PendingIndicator show={isPending} />
      </div>
    </div>
  );
}

function PageLink({
  href,
  onNavigate,
  children,
}: {
  href: string | null;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
}) {
  const className = cn(
    "rounded-md border px-2.5 py-1",
    href === null ? "pointer-events-none opacity-40" : "hover:bg-accent hover:text-accent-foreground"
  );
  if (href === null) return <span className={className}>{children}</span>;
  return (
    <TransitionLink href={href} className={className} onNavigate={onNavigate}>
      {children}
    </TransitionLink>
  );
}

/**
 * Klik kiri polos -> transition-wrapped `router.push` (tidak memicu
 * `loading.tsx`). Klik dengan modifier (ctrl/cmd/shift/alt) atau klik
 * tengah/kanan DIBIARKAN — browser menanganinya sendiri (buka tab baru, dst.)
 * persis seperti `<Link>` biasa, karena `preventDefault` tidak dipanggil.
 */
function TransitionLink({
  href,
  onNavigate,
  className,
  ["aria-current"]: ariaCurrent,
  children,
}: {
  href: string;
  onNavigate: (href: string) => void;
  className?: string;
  "aria-current"?: "true" | undefined;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </Link>
  );
}
