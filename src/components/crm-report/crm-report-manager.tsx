"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { loadCrmReportListPage, setCrmReportArchivedAction } from "@/app/crm-reports-actions";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/ui/button";
import { buildCrmReportColumns } from "./crm-report-columns";
import type { CrmReportListResult, CrmReportRow } from "@/lib/crm-report-types";
import type { CrmReportListFilter } from "@/lib/crm-report-contracts";

/** Klik baris / "Input Laporan" -> navigasi ke halaman penuh Input/Edit Laporan
 *  CRM (src/components/crm-report/crm-report-workspace-form.tsx), bukan modal. */
export function CrmReportManager({
  filter,
  initialData,
  exportQuery,
  showTaskColumns = false,
  previewRow,
  reloadKey = 0,
  hideInputAction = false,
}: {
  filter: Omit<CrmReportListFilter, "page" | "perPage">;
  initialData: CrmReportListResult;
  /** Query string (tanpa leading '?') filter aktif — dipakai route export supaya hasil export = hasil filter yang sedang dilihat. */
  exportQuery: string;
  /** true di Workspace > Laporan Kerja — kolom Jenis Tugas/Status/Outcome/PIC dari task yang tertaut. */
  showTaskColumns?: boolean;
  /** Baris draft realtime di paling atas. id wajib <= 0 agar bukan target CRUD. */
  previewRow?: CrmReportRow;
  reloadKey?: number;
  hideInputAction?: boolean;
}) {
  const router = useRouter();
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  const { rows, total, loading, hasMore, loadMore, reload, error } = useInfiniteRows(
    loadCrmReportListPage,
    filter,
    filterKey,
    initialData
  );

  async function handleArchiveToggle(row: CrmReportRow) {
    if (row.id <= 0) return;
    await setCrmReportArchivedAction(row.id, !row.archivedAt);
    reload();
  }

  const columns = React.useMemo(() => buildCrmReportColumns(handleArchiveToggle, showTaskColumns), [reload, showTaskColumns]);
  const displayRows = previewRow ? [previewRow, ...rows] : rows;

  React.useEffect(() => {
    if (reloadKey > 0) reload();
  }, [reloadKey, reload]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <AnimatedNumber value={total} /> laporan{rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!hideInputAction ? (
            <Button size="sm" asChild>
              <Link href="/workspace/input-kerja/baru">
                <Plus className="h-3.5 w-3.5" /> Input Laporan
              </Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/crm-reports/export.csv?${exportQuery}`}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/crm-reports/export.xlsx?${exportQuery}`}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
            </a>
          </Button>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <DataTable
        columns={columns}
        rows={displayRows}
        rowKey={(row) => row.id}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        emptyMessage="Belum ada laporan CRM. Klik 'Input Laporan' untuk menambahkan."
        onRowClick={(row) => {
          if (row.id > 0) router.push(`/workspace/input-kerja/${row.id}`);
        }}
      />
    </div>
  );
}
