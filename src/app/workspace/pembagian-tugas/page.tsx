import { loadAssignableCrmUsers, loadWorkspaceOverview, loadWorkspaceTaskList } from "@/app/workspace-actions";
import { WORKSPACE_TASK_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskKpiGrid } from "@/components/workspace/task-kpi-grid";
import { TaskManager } from "@/components/workspace/task-manager";
import type {
  CrmTaskOutcome,
  CrmTaskStatus,
  CrmTaskType,
  WorkspaceTaskListFilter,
  WorkspaceTaskTab,
} from "@/lib/workspace-contracts";
import {
  CRM_TASK_OUTCOMES,
  CRM_TASK_STATUSES,
  CRM_TASK_TYPES,
  WORKSPACE_TASK_TABS,
  WORKSPACE_TASK_TAB_STATUSES,
} from "@/lib/workspace-contracts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Workspace > Pembagian Tugas — antrean kerja CRM (customer baru + follow-up).
 * Task BUKAN sumber transaksi/cluster — hanya mengarahkan pekerjaan CRM.
 * Sumber data: src/server/workspace/tasks.ts (daftar) + overview.ts (KPI).
 */
export default async function PembagianTugasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = first(params.search);
  const picRaw = first(params.pic);
  const status = first(params.status);
  const taskType = first(params.taskType);
  const outcome = first(params.outcome);
  const from = first(params.from);
  const to = first(params.to);
  const overdueOnly = first(params.overdue) === "1";
  const tabRaw = first(params.tab);
  const tab: WorkspaceTaskTab = (WORKSPACE_TASK_TABS as readonly string[]).includes(tabRaw ?? "")
    ? (tabRaw as WorkspaceTaskTab)
    : "task";

  const filter: Omit<WorkspaceTaskListFilter, "page" | "perPage"> = {
    search,
    pic: picRaw === "UNASSIGNED" ? "UNASSIGNED" : picRaw ? Number(picRaw) : undefined,
    // Tab menentukan kumpulan status; dropdown Status mempersempit DI DALAM tab.
    statuses: [...WORKSPACE_TASK_TAB_STATUSES[tab]],
    status: (CRM_TASK_STATUSES as readonly string[]).includes(status ?? "") ? (status as CrmTaskStatus) : undefined,
    taskType: (CRM_TASK_TYPES as readonly string[]).includes(taskType ?? "") ? (taskType as CrmTaskType) : undefined,
    outcome: (CRM_TASK_OUTCOMES as readonly string[]).includes(outcome ?? "") ? (outcome as CrmTaskOutcome) : undefined,
    dateFrom: from,
    dateTo: to,
    overdueOnly,
  };

  let initialData;
  let picOptions;
  let overview;
  try {
    [initialData, picOptions, overview] = await Promise.all([
      loadWorkspaceTaskList({ ...filter, page: 1, perPage: WORKSPACE_TASK_LIST_CHUNK }),
      loadAssignableCrmUsers(),
      loadWorkspaceOverview(),
    ]);
  } catch {
    return (
      <AppShell title="Pembagian Tugas" prominentTitle>
        <Card>
          <CardHeader>
            <CardTitle>Gagal memuat data tugas.</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log, lalu muat ulang halaman ini.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Pembagian Tugas" prominentTitle>
      <div className="space-y-4">
        <TaskKpiGrid kpi={overview.kpi} />
        <TaskManager filter={filter} initialData={initialData} picOptions={picOptions} tab={tab} kpi={overview.kpi} />
      </div>
    </AppShell>
  );
}
