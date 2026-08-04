"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Klik nama/avatar -> menu dengan Logout. Trigger diberi warna terang di atas
 *  header biru (mode terang); dark mode kembali ke warna netral biasa. */
export function UserMenu({ name, role }: { name: string; role: UserRole }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors",
            "border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10",
            "dark:border-input dark:text-foreground dark:hover:bg-accent"
          )}
          aria-label={`Menu akun ${name}`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 dark:bg-accent">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="hidden max-w-[120px] truncate font-medium sm:inline">{name}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="normal-case text-foreground">
          <p className="truncate font-medium">{name}</p>
          <p className="mt-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">{role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => signOut({ redirectTo: "/login" })}>
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
