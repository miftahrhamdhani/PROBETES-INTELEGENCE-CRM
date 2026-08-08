"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { PageTransition } from "@/components/motion/page-transition";
import { cn } from "@/lib/utils";
import type { ActiveDatasetInfo } from "@/lib/dataset-types";
import type { UserRole } from "@/lib/roles";
import { AppSidebar, SIDEBAR_OPEN_KEY } from "./app-sidebar";
import { GlobalHeader } from "./global-header";

/** Role+nama sudah dipastikan valid oleh middleware/guard server sebelum halaman
 *  ini sempat dirender — `null` hanya berarti "sesi belum diketahui" (mis. saat
 *  error tak terduga), bukan sinyal untuk mencoba menebak akses. */
export type ShellSessionUser = { name: string; role: UserRole } | null;

export function AppShellClient({
  title,
  children,
  dataset,
  sessionUser,
  prominentTitle = false,
  breadcrumb,
  hidePageHeader = false,
}: {
  title: string;
  children: ReactNode;
  dataset: ActiveDatasetInfo;
  sessionUser: ShellSessionUser;
  /** Judul lebih besar + ikon jam pada baris tanggal — lihat AppShell. */
  prominentTitle?: boolean;
  /** Baris breadcrumb kecil di atas judul — lihat AppShell. */
  breadcrumb?: ReactNode;
  hidePageHeader?: boolean;
}) {
  // Nilai tersimpan "true"/hilang = expanded, "false" = collapsed — sama makna
  // dengan versi lama (dulu "false" berarti sidebar disembunyikan total,
  // sekarang berarti diciutkan jadi rail ikon). Default expanded di render
  // pertama (sama dengan SSR) supaya tidak ada hydration mismatch, dikoreksi
  // sekali lewat effect setelah localStorage tersedia di client.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_OPEN_KEY) === "false");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(!next));
      return next;
    });
  }

  return (
    <div className="min-h-screen">
      <GlobalHeader sessionUser={sessionUser} />
      <div className="lg:flex">
        <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} dataset={dataset} role={sessionUser?.role} />
        <main className="min-w-0 flex-1 p-4 xl:p-6">
          <div className="mx-auto max-w-[1600px]">
            {!hidePageHeader ? (
              <>
                {breadcrumb ? <div className="mb-1">{breadcrumb}</div> : null}
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h1 className={cn("font-semibold tracking-tight", prominentTitle ? "text-2xl" : "text-lg")}>{title}</h1>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {prominentTitle ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                    <span>
                      Data {prominentTitle ? "per" : "as of"} {formatDate(dataset.asOfDate)} · Analytics memakai order kanonik
                    </span>
                  </p>
                </div>
              </>
            ) : null}
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
}
