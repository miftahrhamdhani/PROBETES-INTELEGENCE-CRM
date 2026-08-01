"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { canAccessPath } from "@/lib/roles";
import { ThemeToggle } from "./theme-toggle";

export function GlobalHeader({ title, asOfDate }: { title: string; asOfDate: string | null }) {
  const user = useSession().data?.user;
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex min-h-16 flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">Data as of {formatDate(asOfDate)} · Analytics memakai order kanonik</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kontrol global">
          {pathname === "/customers" || pathname === "/groups" ? <DateRangeFilter /> : null}
          {pathname === "/workspace/input-kerja" ? <DateRangeFilter paramFrom="reportFrom" paramTo="reportTo" /> : null}
          <ThemeToggle />
          {canAccessPath(user?.role, "/import") ? (
            <Button size="sm" asChild><Link href="/import"><Upload className="h-3.5 w-3.5" /> Upload data</Link></Button>
          ) : null}
          {user?.role ? <UserMenu name={user.name ?? user.email ?? "User"} role={user.role} /> : null}
        </div>
      </div>
    </header>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
}
