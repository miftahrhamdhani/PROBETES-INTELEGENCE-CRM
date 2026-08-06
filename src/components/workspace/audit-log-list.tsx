"use client";

import * as React from "react";
import { History, Loader2 } from "lucide-react";
import { loadEntityAuditLogAction } from "@/app/workspace-audit-actions";
import { Button } from "@/components/ui/button";

type EntityType = "WORKSPACE_ORDER" | "WORKSPACE_PRODUCT" | "WORKSPACE_PRODUCT_ALIAS" | "WORKSPACE_COST";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

/** "Lihat Audit" generik — dipakai Pesanan/Master Data/Biaya Operasional. */
export function AuditLogList({ entityType, entityId }: { entityType: EntityType; entityId: string | number }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof loadEntityAuditLogAction>> | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !rows) {
      setLoading(true);
      try {
        setRows(await loadEntityAuditLogAction({ entityType, entityId }));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="text-xs">
      <Button type="button" variant="ghost" size="sm" onClick={toggle} className="gap-1.5 px-2">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Lihat Audit
      </Button>
      {open ? (
        <div className="mt-1.5 max-h-56 overflow-auto rounded-md border p-2">
          {loading ? (
            <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Memuat riwayat...</p>
          ) : !rows || rows.length === 0 ? (
            <p className="text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((entry) => (
                <li key={entry.id} className="border-b pb-1.5 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground">{entry.actorName ?? "Sistem"}{entry.reason ? ` — ${entry.reason}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
