import { AppShellSkeleton } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton yang MENIRU layout final Pembagian Tugas (6 KPI -> panel filter ->
 * card tabel) supaya tidak ada pergeseran layout saat data selesai dimuat.
 */
export default function Loading() {
  return (
    <AppShellSkeleton title="Pembagian Tugas">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-14" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="flex-1 space-y-1.5 xl:max-w-xs">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-end">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-1.5 xl:w-40">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
              <div className="flex items-end gap-2 xl:ml-auto">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-9 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="border-t">
            <div className="flex gap-4 border-b bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 10 }, (_, row) => (
              <div key={row} className="flex gap-4 border-b px-3 py-3 last:border-b-0">
                {Array.from({ length: 8 }, (_, col) => (
                  <Skeleton key={col} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
      </div>
    </AppShellSkeleton>
  );
}
