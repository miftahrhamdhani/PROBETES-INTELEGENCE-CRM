"use client";

import * as React from "react";
import { CostFilterBar } from "@/components/workspace/cost-filter-bar";
import { CostManager } from "@/components/workspace/cost-manager";
import type { WorkspaceCostRow } from "@/lib/workspace-cost-contracts";

export type CostPermissions = {
  create: boolean;
  update: boolean;
  submit: boolean;
  leaderVerify: boolean;
  spvApprove: boolean;
  directorApprove: boolean;
  requestRevision: boolean;
  reject: boolean;
  cancel: boolean;
  export: boolean;
  auditRead: boolean;
};

export function CostPageClient(props: {
  rows: WorkspaceCostRow[];
  total: number;
  page: number;
  perPage: number;
  currentUser: { id: number; name: string; role: "ADMIN" | "CRM" | "MANAGEMENT" };
  permissions: CostPermissions;
}) {
  const createRef = React.useRef<(() => void) | null>(null);
  return (
    <>
      <CostFilterBar canCreate={props.permissions.create} onCreate={() => createRef.current?.()} />
      <CostManager
        initialRows={props.rows}
        total={props.total}
        page={props.page}
        perPage={props.perPage}
        currentUser={props.currentUser}
        permissions={props.permissions}
        onCreateRequest={createRef}
      />
    </>
  );
}
