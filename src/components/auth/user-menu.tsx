"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/roles";

export function UserMenu({ name, role }: { name: string; role: UserRole }) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="max-w-[140px] truncate text-xs font-medium">{name}</p>
        <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">{role}</Badge>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => signOut({ redirectTo: "/login" })}
        aria-label="Keluar"
        title="Keluar"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
