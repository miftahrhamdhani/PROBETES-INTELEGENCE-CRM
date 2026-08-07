/**
 * SHARED — tipe daftar & detail Workspace (tasks, overview, riwayat CRM di
 * customer detail). Uang dikirim sebagai string rupiah mentah (bukan bigint).
 */
import type { ClusterAssignmentCode } from "./cluster-codes";
import type { MembershipStatusValue } from "./membership-contracts";
import type { CrmTaskOutcome, CrmTaskStatus, CrmTaskType } from "./workspace-contracts";

export type WorkspaceTaskRow = {
  id: number;
  customerId: number;
  customerName: string;
  customerPhone: string;
  firstOrderDate: string | null;
  firstProductName: string | null;
  /** Sumber/channel closing pertama customer (division order pertama dari Database All). */
  firstOrderDivision: string | null;
  clusterCode: ClusterAssignmentCode | null;
  membershipStatus: MembershipStatusValue;
  taskType: CrmTaskType;
  status: CrmTaskStatus;
  outcome: CrmTaskOutcome | null;
  picUserId: number | null;
  picName: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  notes: string | null;
  deletedFromStatus: CrmTaskStatus | null;
  deletedAt: string | null;
  overdue: boolean;
  createdAt: string;
};

export type WorkspaceTaskListResult = {
  rows: WorkspaceTaskRow[];
  total: number;
  page: number;
  perPage: number;
};

export type WorkspaceTaskHistoryEntry = {
  id: number;
  fromStatus: CrmTaskStatus | null;
  toStatus: CrmTaskStatus;
  note: string | null;
  changedByName: string | null;
  changedAt: string;
};

export type WorkspaceTaskDetail = WorkspaceTaskRow & {
  assignedByName: string | null;
  completedByName: string | null;
  linkedReport: { id: number; reportDate: string; totalPayment: string; itemsSummary: string } | null;
  history: WorkspaceTaskHistoryEntry[];
};

/** Baris ringkas untuk "Riwayat CRM" di Customer Detail Sheet. */
export type CustomerTaskHistoryRow = {
  id: number;
  taskType: CrmTaskType;
  status: CrmTaskStatus;
  outcome: CrmTaskOutcome | null;
  picName: string | null;
  dueAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type WorkspacePicSummaryRow = {
  userId: number;
  userName: string;
  unassigned: number;
  assigned: number;
  inProgress: number;
  done: number;
  overdue: number;
  closing: number;
  joinedGroup: number;
  total: number;
};

export type WorkspaceOverviewKpi = {
  newCustomersLastImport: number;
  unassigned: number;
  assigned: number;
  inProgress: number;
  done: number;
  overdue: number;
  closing: number;
  joinedGroup: number;
  deleted: number;
};

export type WorkspaceOverview = {
  kpi: WorkspaceOverviewKpi;
  picSummary: WorkspacePicSummaryRow[];
};

export type CrmUserOption = { id: number; name: string };
