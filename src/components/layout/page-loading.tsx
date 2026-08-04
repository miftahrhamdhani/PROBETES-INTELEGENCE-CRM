import { AppShellSkeleton } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton bersama untuk loading.tsx tiap route.
 *
 * Tujuannya feedback SEGERA saat sidebar diklik: seluruh halaman analytics
 * `force-dynamic`, jadi tanpa ini browser diam sampai query selesai dan
 * perpindahan terasa menggantung.
 */
export function PageLoading({
  title,
  variant = "cards",
}: {
  title: string;
  variant?: "cards" | "table" | "wide-table";
}) {
  return (
    <AppShellSkeleton title={title}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>

        {variant === "cards" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        ) : null}

        <Skeleton className={variant === "wide-table" ? "h-[28rem] w-full rounded-lg" : "h-96 w-full rounded-lg"} />
      </div>
    </AppShellSkeleton>
  );
}
