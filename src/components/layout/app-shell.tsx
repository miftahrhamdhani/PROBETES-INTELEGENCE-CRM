import type { ReactNode } from "react";
import { getActiveDatasetInfo } from "@/server/analytics/dataset";
import { AppShellClient } from "./app-shell-client";

/** Server wrapper: satu query ringan memberi tanggal/status dataset ke seluruh layout. */
export async function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const dataset = await getActiveDatasetInfo().catch(() => ({
    asOfDate: null,
    databaseAllActive: false,
    ksbActive: false,
    groupListActive: false,
  }));
  return <AppShellClient title={title} dataset={dataset}>{children}</AppShellClient>;
}
