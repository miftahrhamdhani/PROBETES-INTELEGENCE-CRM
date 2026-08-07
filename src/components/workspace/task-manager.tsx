"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2, MoreVertical, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  assignTaskAction,
  bulkAssignTasksAction,
  bulkSetTaskStatusAction,
  bulkSetTaskTypeAction,
  loadWorkspaceTaskListPage,
  moveTasksToTrashAction,
  permanentlyDeleteTasksAction,
  restoreTasksAction,
  setTaskStatusAction,
} from "@/app/workspace-actions";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AddTaskDialog } from "./add-task-dialog";
import { AssignTaskDialog } from "./assign-task-dialog";
import { TaskBulkToolbar } from "./task-bulk-toolbar";
import { buildWorkspaceTaskColumns } from "./task-columns";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskRowMenu, type TaskMenuTarget } from "./task-row-menu";
import { TaskSearchFilter } from "./task-search-filter";
import { TaskTable } from "./task-table";
import { TaskTabs } from "./task-tabs";
import { CompleteBroadcastDialog, EditNotesDialog } from "./task-outcome-dialogs";
import {
  BULK_STATUS_TARGETS,
  CRM_TASK_STATUS_LABELS,
  canTransitionStatus,
  type CrmTaskStatus,
  type ManualCrmTaskType,
  type WorkspaceTaskListFilter,
  type WorkspaceTaskTab,
} from "@/lib/workspace-contracts";
import type { CrmUserOption, WorkspaceOverviewKpi, WorkspaceTaskRow } from "@/lib/workspace-types";

/** Status tujuan yang boleh diset lewat setTaskStatusAction (DONE wajib lewat
 *  "Selesaikan Tugas" di Detail Task — lihat guard di server action). */
const SINGLE_STATUS_TARGETS = BULK_STATUS_TARGETS.filter((status) => status !== "ASSIGNED");

export function TaskManager({
  filter,
  initialData,
  picOptions,
  tab,
  kpi,
}: {
  filter: Omit<WorkspaceTaskListFilter, "page" | "perPage">;
  initialData: PagedResult<WorkspaceTaskRow>;
  picOptions: CrmUserOption[];
  tab: WorkspaceTaskTab;
  kpi: WorkspaceOverviewKpi;
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
  const [assignTarget, setAssignTarget] = React.useState<"bulk" | WorkspaceTaskRow | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<WorkspaceTaskRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkspaceTaskRow | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = React.useState<WorkspaceTaskRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<WorkspaceTaskRow | null>(null);
  const [bulkCompleteIds, setBulkCompleteIds] = React.useState<number[] | null>(null);
  const [notesTarget, setNotesTarget] = React.useState<WorkspaceTaskRow | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [menuTarget, setMenuTarget] = React.useState<TaskMenuTarget | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  // Filter berubah -> pilihan & halaman ikut direset supaya tidak ada task dari
  // hasil filter lama yang diam-diam ikut terkena aksi massal.
  React.useEffect(() => {
    setSelected(new Set());
    setPage(1);
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
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const isAllSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return isAllSelected ? new Set() : new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const openDetail = React.useCallback(
    (row: WorkspaceTaskRow) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("task", String(row.id));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const resetFilter = React.useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  const handleRestore = React.useCallback(
    async (taskIds: number[]) => {
      const result = await restoreTasksAction({ taskIds });
      setSelected(new Set());
      reload();
      if (result.skipped) toast.warning(`${result.restored} task dipulihkan, ${result.skipped} dilewati.`);
      else toast.success(`${result.restored} task dipulihkan.`);
    },
    [reload]
  );

  const columns = React.useMemo(
    () =>
      buildWorkspaceTaskColumns({
        selectedIds: selected,
        onToggle: toggle,
        allSelected,
        someSelected,
        onToggleAll: toggleAll,
        rowOffset: (page - 1) * pageSize,
        onView: openDetail,
        onAssign: (task) => setAssignTarget(task),
        onSetStatus: (task) => setStatusTarget(task),
        onComplete: (task) => setCompleteTarget(task),
        onEditNotes: (task) => setNotesTarget(task),
        onDelete: (task) => setDeleteTarget(task),
        onRestore: (task) => {
          void handleRestore([task.id]);
        },
        onPermanentDelete: (task) => setPermanentDeleteTarget(task),
        tab,
      }),
    [selected, allSelected, someSelected, toggleAll, page, pageSize, openDetail, handleRestore, tab]
  );

  async function handleAssignSubmit(input: { assignedTo: number; dueAt: string | null }) {
    if (assignTarget === "bulk") {
      await bulkAssignTasksAction({ taskIds: [...selected], ...input });
      setSelected(new Set());
    } else if (assignTarget) {
      await assignTaskAction(assignTarget.id, input);
    }
    setAssignTarget(null);
    reload();
  }

  async function handleBulkStatus(status: (typeof BULK_STATUS_TARGETS)[number]) {
    const result = await bulkSetTaskStatusAction({ taskIds: [...selected], status });
    setSelected(new Set());
    reload();
    if (result.skipped) toast.warning(`${result.updated} task diperbarui, ${result.skipped} dilewati.`);
  }

  async function handleBulkTaskType(taskType: ManualCrmTaskType) {
    const result = await bulkSetTaskTypeAction({ taskIds: [...selected], taskType });
    setSelected(new Set());
    reload();
    if (result.skipped) toast.warning(`${result.updated} task diperbarui, ${result.skipped} dilewati.`);
    else toast.success(`${result.updated} jenis tugas diperbarui.`);
  }

  async function handleMoveToTrash(taskIds: number[]) {
    const result = await moveTasksToTrashAction({ taskIds });
    setSelected(new Set());
    reload();
    if (result.skipped) toast.warning(`${result.updated} task dipindahkan, ${result.skipped} dilewati.`);
    else toast.success(`${result.updated} task dipindahkan ke Riwayat Hapus.`);
  }

  async function handlePermanentDelete(taskIds: number[]) {
    const result = await permanentlyDeleteTasksAction({ taskIds });
    setSelected(new Set());
    reload();
    if (result.skipped) toast.warning(`${result.deleted} task dihapus permanen, ${result.skipped} dilewati.`);
    else toast.success(`${result.deleted} task dihapus permanen.`);
  }

  async function handleDeleteOne(task: WorkspaceTaskRow) {
    try {
      await handleMoveToTrash([task.id]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memindahkan task ke Riwayat Hapus");
    }
  }

  const loadedLabel = `${total.toLocaleString("id-ID")} task • ${rows.length.toLocaleString("id-ID")} dimuat`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <TaskTabs
          active={tab}
          counts={{ task: kpi.unassigned, broadcast: kpi.assigned + kpi.inProgress, completed: kpi.done, trash: kpi.deleted }}
        />
        <TaskSearchFilter picOptions={picOptions} onAddTask={() => setAddOpen(true)} tab={tab} />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-xs font-medium">
              {loadedLabel}
              {loading ? <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
            </p>
            <div className="flex items-center gap-1.5">
              <IconButton label="Muat ulang data" onClick={reload}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
              <IconButton label="Reset filter" onClick={resetFilter}>
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Aksi lain"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!hasMore || loading} onSelect={() => loadMore()}>
                    Muat lebih banyak
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!someSelected} onSelect={() => setSelected(new Set())}>
                    Batalkan pilihan
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={resetFilter}>Reset filter</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <TaskBulkToolbar
            selectedCount={selected.size}
            onClear={() => setSelected(new Set())}
            onAssign={() => setAssignTarget("bulk")}
            onBulkTaskType={handleBulkTaskType}
            onBulkStatus={handleBulkStatus}
            onBulkComplete={() => setBulkCompleteIds([...selected])}
            onDelete={() => handleMoveToTrash([...selected])}
            trashMode={tab === "trash"}
            onRestore={() => handleRestore([...selected])}
            onPermanentDelete={() => handlePermanentDelete([...selected])}
          />

          {error ? (
            <div className="border-t px-4 py-12 text-center">
              <p className="text-sm font-medium">Gagal memuat data tugas.</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={reload}>
                Coba Lagi
              </Button>
            </div>
          ) : (
            <TaskTable
              columns={columns}
              rows={rows}
              total={total}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onRowClick={openDetail}
              onRowContextMenu={tab === "trash" ? undefined : (row, event) =>
                setMenuTarget({ taskId: row.id, customerName: row.customerName, x: event.clientX, y: event.clientY })
              }
              selectedIds={selected}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              emptyState={
                <div className="text-center">
                  <p className="text-sm font-medium">Tidak ada tugas yang sesuai dengan filter.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ubah atau kosongkan filter untuk melihat tugas lain.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={resetFilter}>
                    Reset Filter
                  </Button>
                </div>
              }
            />
          )}
        </div>

        {tab !== "trash" ? (
          <TaskRowMenu target={menuTarget} onClose={() => setMenuTarget(null)} onDelete={(taskId) => {
            const task = rows.find((r) => r.id === taskId);
            if (task) handleDeleteOne(task);
          }} />
        ) : null}

        <AssignTaskDialog
          open={assignTarget !== null}
          onOpenChange={(open) => !open && setAssignTarget(null)}
          picOptions={picOptions}
          count={assignTarget === "bulk" ? selected.size : 1}
          onSubmit={handleAssignSubmit}
        />

        <SetStatusDialog
          task={statusTarget}
          onOpenChange={(open) => !open && setStatusTarget(null)}
          onDone={() => {
            setStatusTarget(null);
            reload();
          }}
        />

        <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus task {deleteTarget?.customerName}?</AlertDialogTitle>
              <AlertDialogDescription>
                Task dipindahkan ke Riwayat Hapus dan masih bisa dipulihkan. Data customer tidak berubah.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTarget) handleDeleteOne(deleteTarget);
                  setDeleteTarget(null);
                }}
              >
                Hapus Task
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={permanentDeleteTarget !== null}
          onOpenChange={(open) => !open && setPermanentDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus permanen task {permanentDeleteTarget?.customerName}?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini tidak bisa dibatalkan. Hanya task dan riwayat kerjanya yang dihapus; data customer tetap aman.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (permanentDeleteTarget) handlePermanentDelete([permanentDeleteTarget.id]);
                  setPermanentDeleteTarget(null);
                }}
              >
                Hapus Permanen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CompleteBroadcastDialog
          task={completeTarget}
          bulkTaskIds={bulkCompleteIds}
          onOpenChange={(open) => {
            if (!open) {
              setCompleteTarget(null);
              setBulkCompleteIds(null);
            }
          }}
          onDone={() => {
            setCompleteTarget(null);
            setBulkCompleteIds(null);
            setSelected(new Set());
            reload();
          }}
        />

        <EditNotesDialog
          task={notesTarget}
          onOpenChange={(open) => !open && setNotesTarget(null)}
          onDone={() => {
            setNotesTarget(null);
            reload();
          }}
        />

        <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} onCreated={reload} />
        <TaskDetailSheet picOptions={picOptions} onChanged={reload} />
      </div>
    </TooltipProvider>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Ubah status satu task — memakai setTaskStatusAction dengan daftar tujuan
 *  yang sudah disaring `canTransitionStatus`, aturan yang sama dengan server. */
function SetStatusDialog({
  task,
  onOpenChange,
  onDone,
}: {
  task: WorkspaceTaskRow | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [status, setStatus] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStatus("");
    setError(null);
  }, [task]);

  const targets = task ? SINGLE_STATUS_TARGETS.filter((t) => t !== task.status && canTransitionStatus(task.status, t)) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !status) return;
    setSaving(true);
    setError(null);
    try {
      await setTaskStatusAction(task.id, { status: status as CrmTaskStatus });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ubah Status</DialogTitle>
            <DialogDescription>
              {task ? `${task.customerName} — status saat ini ${CRM_TASK_STATUS_LABELS[task.status]}.` : null} Status
              Selesai diatur lewat &quot;Selesaikan Broadcast&quot; karena wajib memilih outcome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Status tujuan">
                <SelectValue placeholder="Pilih status tujuan" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target} value={target}>
                    {CRM_TASK_STATUS_LABELS[target]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada perubahan status yang tersedia untuk task ini.</p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={saving || !status}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
