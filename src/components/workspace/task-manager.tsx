"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { bulkAssignTasksAction, bulkSetTaskStatusAction, loadWorkspaceTaskListPage } from "@/app/workspace-actions";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AssignTaskDialog } from "./assign-task-dialog";
import { TaskBulkToolbar } from "./task-bulk-toolbar";
import { buildWorkspaceTaskColumns } from "./task-columns";
import { TaskDetailSheet } from "./task-detail-sheet";
import { BULK_STATUS_TARGETS, type WorkspaceTaskListFilter } from "@/lib/workspace-contracts";
import type { CrmUserOption, WorkspaceTaskRow } from "@/lib/workspace-types";

export function TaskManager({
  filter,
  initialData,
  picOptions,
}: {
  filter: Omit<WorkspaceTaskListFilter, "page" | "perPage">;
  initialData: PagedResult<WorkspaceTaskRow>;
  picOptions: CrmUserOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  const { rows, total, loading, hasMore, loadMore, reload, error } = useInfiniteRows(
    loadWorkspaceTaskListPage,
    filter,
    filterKey,
    initialData
  );

  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [assignOpen, setAssignOpen] = React.useState(false);

  React.useEffect(() => {
    setSelected(new Set());
  }, [filterKey]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openDetail(row: WorkspaceTaskRow) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", String(row.id));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const columns = React.useMemo(
    () => buildWorkspaceTaskColumns({ selectedIds: selected, onToggle: toggle }),
    [selected]
  );

  async function handleBulkAssign(input: { assignedTo: number; dueAt: string | null }) {
    await bulkAssignTasksAction({ taskIds: [...selected], ...input });
    setSelected(new Set());
    reload();
  }

  async function handleBulkStatus(status: (typeof BULK_STATUS_TARGETS)[number]) {
    await bulkSetTaskStatusAction({ taskIds: [...selected], status });
    setSelected(new Set());
    reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <AnimatedNumber value={total} /> task{rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
        <TaskBulkToolbar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          onAssign={() => setAssignOpen(true)}
          onBulkStatus={handleBulkStatus}
        />
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        emptyMessage="Tidak ada task yang cocok dengan filter ini."
        onRowClick={openDetail}
      />

      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} picOptions={picOptions} count={selected.size} onSubmit={handleBulkAssign} />
      <TaskDetailSheet picOptions={picOptions} onChanged={reload} />
    </div>
  );
}
