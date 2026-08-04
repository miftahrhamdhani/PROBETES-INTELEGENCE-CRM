import { loadAssignableCrmUsers, loadWorkspaceTaskList } from "@/app/workspace-actions";
import { WORKSPACE_TASK_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskManager } from "@/components/workspace/task-manager";
import { TaskSearchFilter } from "@/components/workspace/task-search-filter";
import type { CrmTaskOutcome, CrmTaskStatus, CrmTaskType, WorkspaceTaskListFilter } from "@/lib/workspace-contracts";
import { CRM_TASK_OUTCOMES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from "@/lib/workspace-contracts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Workspace > Pembagian Tugas — antrean kerja CRM (customer baru + follow-up).
 * Task BUKAN sumber transaksi/cluster — hanya mengarahkan pekerjaan CRM.
 * Sumber data: src/server/workspace/tasks.ts.
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

  const filter: Omit<WorkspaceTaskListFilter, "page" | "perPage"> = {
    search,
    pic: picRaw === "UNASSIGNED" ? "UNASSIGNED" : picRaw ? Number(picRaw) : undefined,
    status: (CRM_TASK_STATUSES as readonly string[]).includes(status ?? "") ? (status as CrmTaskStatus) : undefined,
    taskType: (CRM_TASK_TYPES as readonly string[]).includes(taskType ?? "") ? (taskType as CrmTaskType) : undefined,
    outcome: (CRM_TASK_OUTCOMES as readonly string[]).includes(outcome ?? "") ? (outcome as CrmTaskOutcome) : undefined,
    dateFrom: from,
    dateTo: to,
    overdueOnly,
  };

  let initialData;
  let picOptions;
  try {
    [initialData, picOptions] = await Promise.all([
      loadWorkspaceTaskList({ ...filter, page: 1, perPage: WORKSPACE_TASK_LIST_CHUNK }),
      loadAssignableCrmUsers(),
    ]);
  } catch {
    return (
      <AppShell title="Pembagian Tugas">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Pembagian Tugas">
      <Card>
        <CardHeader>
          <CardTitle>{initialData.total.toLocaleString("id-ID")} task</CardTitle>
          <CardDescription>
            Klik baris untuk detail · klik kanan/centang untuk bulk assign/hapus · scroll untuk memuat lebih banyak ·
            task Dibatalkan disembunyikan (lihat filter Status)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TaskSearchFilter picOptions={picOptions} />
          <TaskManager filter={filter} initialData={initialData} picOptions={picOptions} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
