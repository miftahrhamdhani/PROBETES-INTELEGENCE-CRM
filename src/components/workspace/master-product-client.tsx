"use client";

import * as React from "react";
import { MasterProductFilterBar } from "@/components/workspace/master-data-filter-bar";
import { MasterProductManager } from "@/components/workspace/master-data-manager";
import type { WorkspaceProductRow } from "@/lib/workspace-master-data-contracts";

export function MasterProductClient(props: {
  rows: WorkspaceProductRow[];
  total: number;
  page: number;
  perPage: number;
  permissions: { create: boolean; update: boolean; deactivate: boolean; alias: boolean; audit: boolean; export: boolean };
}) {
  const createRef = React.useRef<(() => void) | null>(null);
  return (
    <>
      <MasterProductFilterBar canCreate={props.permissions.create} onCreate={() => createRef.current?.()} />
      <MasterProductManager
        initialRows={props.rows}
        total={props.total}
        page={props.page}
        perPage={props.perPage}
        permissions={props.permissions}
        onCreateRequest={createRef}
      />
    </>
  );
}
