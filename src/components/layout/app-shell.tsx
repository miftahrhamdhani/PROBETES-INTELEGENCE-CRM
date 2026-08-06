import type { ReactNode } from "react";
import { auth } from "@/server/auth";
import { getActiveDatasetInfo } from "@/server/analytics/dataset";
import { AppShellClient, type ShellSessionUser } from "./app-shell-client";

/**
 * Role/nama dipakai untuk filter menu sidebar+mobile nav. Diambil dari sesi
 * server (bukan `useSession()` di client) supaya menu tidak pernah kosong
 * karena race hidrasi — lihat catatan di app-sidebar.tsx.
 */
async function getShellSessionUser(): Promise<ShellSessionUser> {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.role) return null;
  return { name: user.name ?? user.email ?? "User", role: user.role };
}

/** Server wrapper: satu query ringan memberi tanggal/status dataset ke seluruh layout. */
export async function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [dataset, sessionUser] = await Promise.all([
    getActiveDatasetInfo().catch(() => ({
      asOfDate: null,
      databaseAllActive: false,
      ksbActive: false,
      groupListActive: false,
    })),
    getShellSessionUser(),
  ]);
  return (
    <AppShellClient title={title} dataset={dataset} sessionUser={sessionUser}>
      {children}
    </AppShellClient>
  );
}

/**
 * Versi untuk loading.tsx — TANPA query dataset, supaya skeleton muncul seketika
 * saat sidebar diklik dan tidak ikut menunggu round-trip DB.
 */
export async function AppShellSkeleton({ title, children }: { title: string; children: ReactNode }) {
  const sessionUser = await getShellSessionUser();
  return (
    <AppShellClient
      title={title}
      dataset={{ asOfDate: null, databaseAllActive: false, ksbActive: false, groupListActive: false }}
      sessionUser={sessionUser}
    >
      {children}
    </AppShellClient>
  );
}
