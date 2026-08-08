"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table/data-table";
import { PesananBulkToolbar } from "@/components/workspace/pesanan-bulk-toolbar";
import { buildPesananColumns } from "@/components/workspace/pesanan-columns";
import { PesananDetailSheet } from "@/components/workspace/pesanan-detail-sheet";
import { PesananMoveDialog } from "@/components/workspace/pesanan-move-dialog";
import { PesananRowMenu, type PesananMenuTarget } from "@/components/workspace/pesanan-row-menu";
import { MOVE_LABEL_BY_TAB, MOVE_TARGETS_BY_TAB, type WorkspaceOrderRow, type WorkspacePesananTab } from "@/lib/workspace-pesanan-contracts";

/**
 * Checkbox + klik-kanan (Edit Data/Lihat Data/Pindahkan) — pola sama dengan
 * CustomerListTable/TaskManager. "Pindahkan" aktif di SEMUA tab, target beda
 * per tab lewat MOVE_TARGETS_BY_TAB/MOVE_LABEL_BY_TAB (workspace-pesanan-
 * contracts.ts): "draft" -> Confirmed/Cancel; "semua" -> Cancel/Retur/Refund;
 * "retur_refund" -> Confirmed saja (lihat PesananMoveDialog).
 */
export function PesananManager({ rows, tab }: { rows: WorkspaceOrderRow[]; tab: WorkspacePesananTab }) {
  const router = useRouter();
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [menuTarget, setMenuTarget] = React.useState<PesananMenuTarget | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    setSelected(new Set());
  }, [rows]);

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

  const openMenu = React.useCallback(
    (row: WorkspaceOrderRow, x: number, y: number) => {
      setMenuTarget({ ids: selected.size > 0 ? [...selected] : [row.id], x, y });
    },
    [selected]
  );

  const columns = React.useMemo(
    () =>
      buildPesananColumns({
        selectedIds: selected,
        onToggle: toggle,
        allSelected,
        someSelected,
        onToggleAll: toggleAll,
        onView: setDetailId,
      }),
    [selected, allSelected, someSelected, toggleAll]
  );

  const moveTargets = MOVE_TARGETS_BY_TAB[tab];
  const moveLabel = MOVE_LABEL_BY_TAB[tab];

  return (
    <div className="space-y-2">
      <PesananBulkToolbar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        moveLabel={moveLabel}
        onRequestMove={() => setMoveTarget([...selected])}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
        height={560}
        rowHeight={44}
        onRowClick={(row) => setDetailId(row.id)}
        onRowContextMenu={(row, event) => openMenu(row, event.clientX, event.clientY)}
      />
      <PesananDetailSheet id={detailId} onClose={() => setDetailId(null)} />
      <PesananRowMenu
        target={menuTarget}
        onClose={() => setMenuTarget(null)}
        onEdit={(id) => router.push(`/workspace/pesanan/${id}/edit`)}
        onView={setDetailId}
        moveLabel={moveLabel}
        onRequestMove={setMoveTarget}
      />
      <PesananMoveDialog
        ids={moveTarget}
        targets={moveTargets}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        onMoved={() => {
          setSelected(new Set());
          router.refresh();
        }}
      />
    </div>
  );
}
