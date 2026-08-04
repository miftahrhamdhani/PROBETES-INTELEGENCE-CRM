"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { bulkAssignTasksAction, bulkSetTaskStatusAction, loadWorkspaceTaskListPage, setTaskStatusAction } from "@/app/workspace-actions";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/ui/button";
import { AddTaskDialog } from "./add-task-dialog";
import { AssignTaskDialog } from "./assign-task-dialog";
import { TaskBulkToolbar } from "./task-bulk-toolbar";
import { buildWorkspaceTaskColumns } from "./task-columns";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskRowMenu, type TaskMenuTarget } from "./task-row-menu";
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
  const [addOpen, setAddOpen] = React.useState(false);
  const [menuTarget, setMenuTarget] = React.useState<TaskMenuTarget | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

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

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;
  // useCallback + functional setState — lihat catatan di customer-list-table.tsx.
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const isAllSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return isAllSelected ? new Set() : new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  function openDetail(row: WorkspaceTaskRow) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", String(row.id));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const openMenu = React.useCallback((row: WorkspaceTaskRow, x: number, y: number) => {
    setMenuTarget({ taskId: row.id, customerName: row.customerName, x, y });
  }, []);

  const columns = React.useMemo(
    () => buildWorkspaceTaskColumns({ selectedIds: selected, onToggle: toggle, allSelected, someSelected, onToggleAll: toggleAll }),
    [selected, allSelected, someSelected, toggleAll]
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

  async function handleDeleteOne(taskId: number) {
    setDeleteError(null);
    try {
      await setTaskStatusAction(taskId, { status: "CANCELLED" });
      reload();
    } catch (err) {
      // Task berstatus DONE tidak bisa dibatalkan (canTransitionStatus) — tampilkan
      // pesannya, jangan biarkan menggantung sebagai unhandled rejection.
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus task");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <AnimatedNumber value={total} /> task{rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <TaskBulkToolbar
            selectedCount={selected.size}
            onClear={() => setSelected(new Set())}
            onAssign={() => setAssignOpen(true)}
            onBulkStatus={handleBulkStatus}
          />
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Tambah Tugas
          </Button>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        emptyMessage="Tidak ada task yang cocok dengan filter ini."
        onRowClick={openDetail}
        onRowContextMenu={(row, event) => openMenu(row, event.clientX, event.clientY)}
      />

      <TaskRowMenu target={menuTarget} onClose={() => setMenuTarget(null)} onDelete={handleDeleteOne} />
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} picOptions={picOptions} count={selected.size} onSubmit={handleBulkAssign} />
      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} onCreated={reload} />
      <TaskDetailSheet picOptions={picOptions} onChanged={reload} />
    </div>
  );
}
