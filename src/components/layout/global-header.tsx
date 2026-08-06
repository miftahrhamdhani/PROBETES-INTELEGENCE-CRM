"use client";

import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/auth/user-menu";
import type { ShellSessionUser } from "./app-shell-client";
import { GlobalSearch } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function GlobalHeader({ sessionUser }: { sessionUser: ShellSessionUser }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#020945]/20 bg-[#020945] text-primary-foreground dark:border-border dark:bg-black dark:text-foreground">
      <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 lg:h-14 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)] lg:gap-3 lg:px-4 lg:py-0 xl:px-6">
        <MobileNav role={sessionUser?.role} />
        <Link href="/" className="flex min-w-0 items-center gap-2.5 lg:col-start-1 lg:row-start-1" aria-label="PROBETES INTELEGENCE CRM">
          <Image src="/probetes-logo.png" alt="" width={34} height={34} priority className="h-8 w-8 shrink-0 rounded-md object-cover" />
          <span className="truncate text-sm font-bold tracking-tight sm:text-base">PROBETES INTELEGENCE CRM</span>
        </Link>
        <div className="col-span-full row-start-2 w-full lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <GlobalSearch />
        </div>
        <div className="contents lg:flex lg:items-center lg:justify-self-end lg:gap-2">
          <ThemeToggle />
          {sessionUser ? <UserMenu name={sessionUser.name} role={sessionUser.role} /> : null}
        </div>
      </div>
    </header>
  );
}
