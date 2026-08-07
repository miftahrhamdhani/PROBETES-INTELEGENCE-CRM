"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ClipboardList, Megaphone, CircleCheck, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE_TASK_TABS, WORKSPACE_TASK_TAB_LABELS, type WorkspaceTaskTab } from "@/lib/workspace-contracts";

const TAB_ICON: Record<WorkspaceTaskTab, LucideIcon> = {
  task: ClipboardList,
  broadcast: Megaphone,
  completed: CircleCheck,
  trash: Trash2,
};

const TAB_HINT: Record<WorkspaceTaskTab, string> = {
  task: "Belum punya PIC — Leader/SPV membagi ke CRM di sini",
  broadcast: "Sudah punya PIC, broadcast sedang dikerjakan",
  completed: "Sudah selesai di-broadcast, lengkap dengan outcome & catatan",
  trash: "Task terhapus sementara — dapat dipulihkan atau dihapus permanen",
};

/**
 * Tiga tahap kerja Pembagian Tugas. State ada di URL (`?tab=`) supaya bisa
 * di-bookmark & di-share, pola sama dengan filter lain di halaman ini.
 *
 * Ganti tab me-reset `status` (opsi dropdown-nya berbeda per tab) dan `page`,
 * tapi MEMPERTAHANKAN pencarian/PIC/tanggal — operator biasanya menelusuri
 * customer yang sama lintas tahap.
 */
export function TaskTabs({ active, counts }: { active: WorkspaceTaskTab; counts: Record<WorkspaceTaskTab, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function go(tab: WorkspaceTaskTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("page");
    if (tab === "task") params.delete("tab");
    else params.set("tab", tab);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label="Tahap pembagian tugas">
      {WORKSPACE_TASK_TABS.map((tab) => {
        const Icon = TAB_ICON[tab];
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={TAB_HINT[tab]}
            onClick={() => go(tab)}
            disabled={isPending}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {WORKSPACE_TASK_TAB_LABELS[tab]}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] tabular",
                isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {counts[tab].toLocaleString("id-ID")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
