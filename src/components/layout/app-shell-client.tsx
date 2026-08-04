"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";
import type { ActiveDatasetInfo } from "@/lib/dataset-types";
import { AppSidebar, SIDEBAR_OPEN_KEY } from "./app-sidebar";
import { GlobalHeader } from "./global-header";

export function AppShellClient({ title, children, dataset }: { title: string; children: ReactNode; dataset: ActiveDatasetInfo }) {
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
      <GlobalHeader />
      <div className="lg:flex">
        <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} dataset={dataset} />
        <main className="min-w-0 flex-1 p-4 xl:p-6">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">
                Data as of {formatDate(dataset.asOfDate)} · Analytics memakai order kanonik
              </p>
            </div>
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
