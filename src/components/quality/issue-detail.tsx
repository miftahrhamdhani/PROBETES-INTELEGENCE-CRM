"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DataQualityIssueRow } from "@/lib/import-admin-types";

/** Detail baris sumber dibuka inline; raw data tidak pernah diedit. */
export function IssueDetail({ issue }: { issue: DataQualityIssueRow }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setOpen(!open)}>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Tutup" : "Lihat row"}
      </button>
      {open ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <JsonBlock title="Detail issue" value={issue.detail} />
          <JsonBlock title="Raw row (read-only)" value={issue.rawData ?? {}} />
        </div>
      ) : null}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="space-y-1 text-[11px]">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="grid grid-cols-[120px_1fr] gap-2"><dt className="truncate text-muted-foreground" title={key}>{key}</dt><dd className="break-words font-medium">{item == null || item === "" ? "—" : String(item)}</dd></div>
        ))}
      </dl>
    </div>
  );
}
