/** SHARED — dipakai cost-manager.tsx DAN cost-detail-sheet.tsx (dipisah dari
 *  keduanya supaya tidak ada circular import antar dua Client Component). */
import type { CostPermissions } from "./cost-page-client";
import type { WorkspaceCostCategory, WorkspaceCostRow, WorkspaceCostStatus } from "@/lib/workspace-cost-contracts";
import { CANCELLABLE_STATUSES, type CostActorRole, nextApprovalStage, requiredApproverRole, resolveCostRole } from "@/lib/workspace-cost-workflow";

export const CATEGORY_TONE: Record<WorkspaceCostCategory, string> = {
  MEKARI_QONTAK: "border-purple-200 bg-purple-50 text-purple-700",
  WHATSAPP_API: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BROADCAST: "border-blue-200 bg-blue-50 text-blue-700",
  AI_CRM: "border-cyan-200 bg-cyan-50 text-cyan-700",
  SOFTWARE_CRM: "border-slate-300 bg-slate-100 text-slate-700",
  CAMPAIGN_CRM: "border-teal-200 bg-teal-50 text-teal-700",
  DATABASE_LEADS: "border-orange-200 bg-orange-50 text-orange-700",
  SAMPLE_PROMOSI: "border-rose-200 bg-rose-50 text-rose-700",
  COM_LAINNYA: "border-slate-200 bg-slate-100 text-slate-600",
};

export const STATUS_TONE: Record<WorkspaceCostStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-600",
  SUBMITTED: "border-blue-200 bg-blue-50 text-blue-700",
  LEADER_VERIFIED: "border-violet-200 bg-violet-50 text-violet-700",
  SPV_APPROVED: "border-amber-200 bg-amber-50 text-amber-700",
  DIRECTOR_APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REVISION_REQUESTED: "border-yellow-300 bg-yellow-50 text-yellow-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-500",
};

export const CREATOR_ROLE_LABEL: Record<CostActorRole, string | null> = {
  LEADER: "Leader CRM",
  SPV: "SPV Sales",
  DIRECTOR: "Direktur",
  OTHER: null,
};

export type CurrentUser = { id: number; name: string; role: "ADMIN" | "CRM" | "MANAGEMENT" };

/** Aksi yang tersedia untuk actor tertentu atas satu biaya — dihitung dari
 *  data yang SUDAH ada di row/detail (tanpa fetch tambahan), backend tetap
 *  memvalidasi ulang permission + status di setiap server action. */
export function computeCostAvailableActions(
  cost: Pick<WorkspaceCostRow, "status" | "createdBy" | "createdByName">,
  currentUser: CurrentUser,
  permissions: CostPermissions
) {
  const isCreator = cost.createdBy === currentUser.id;
  const isAdmin = currentUser.role === "ADMIN";
  const editable = cost.status === "DRAFT" || cost.status === "REVISION_REQUESTED";
  const canEdit = isCreator && permissions.update && editable;
  const canSubmit = isCreator && permissions.submit && editable;

  const stage = nextApprovalStage(cost.status, resolveCostRole(cost.createdByName));
  const actorRole = resolveCostRole(currentUser.name);
  const isRequiredApprover = stage != null && !isCreator && (actorRole === requiredApproverRole(stage) || isAdmin);
  const canDecide =
    isRequiredApprover &&
    (stage === "LEADER_VERIFY" ? permissions.leaderVerify : stage === "SPV_APPROVE" ? permissions.spvApprove : permissions.directorApprove);
  const canRequestRevision = isRequiredApprover && permissions.requestRevision;
  const canReject = isRequiredApprover && permissions.reject;
  const canCancel =
    permissions.cancel && (isCreator || isAdmin) && (CANCELLABLE_STATUSES.includes(cost.status) || (cost.status === "DIRECTOR_APPROVED" && isAdmin));

  return { isCreator, canEdit, canSubmit, stage, canDecide, canRequestRevision, canReject, canCancel };
}
