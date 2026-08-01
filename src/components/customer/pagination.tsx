import Link from "next/link";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  perPage,
  total,
  hrefForPage,
}: {
  page: number;
  perPage: number;
  total: number;
  hrefForPage: (page: number) => string;
}) {
  const totalPages = Math.max(Math.ceil(total / perPage), 1);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} customer
      </p>
      <div className="flex items-center gap-1">
        <PageLink page={page - 1} disabled={page <= 1} hrefForPage={hrefForPage}>
          Sebelumnya
        </PageLink>
        <span className="px-2 tabular">
          {page} / {totalPages}
        </span>
        <PageLink page={page + 1} disabled={page >= totalPages} hrefForPage={hrefForPage}>
          Berikutnya
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  hrefForPage,
  children,
}: {
  page: number;
  disabled: boolean;
  hrefForPage: (page: number) => string;
  children: React.ReactNode;
}) {
  const className = cn(
    "rounded-md border px-2.5 py-1",
    disabled ? "pointer-events-none opacity-40" : "hover:bg-accent hover:text-accent-foreground"
  );
  if (disabled) return <span className={className}>{children}</span>;
  return (
    <Link href={hrefForPage(page)} className={className} scroll={false}>
      {children}
    </Link>
  );
}
