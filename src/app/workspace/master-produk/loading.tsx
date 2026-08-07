import { AppShellSkeleton } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShellSkeleton title="Master Produk">
      <div className="space-y-4">
        <Skeleton className="h-4 w-[520px] max-w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[110px] rounded-xl" />)}
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-4 flex justify-between"><Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-48" /></div>
          {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="mb-2 h-9 w-full" />)}
        </div>
      </div>
    </AppShellSkeleton>
  );
}
