import type { WorkspaceCostStatus } from "./workspace-cost-contracts";

/**
 * SHARED — pure state machine approval chain Biaya Operasional (docs prompt
 * §9.4). Dipakai backend (`server/workspace/costs.ts`, otoritatif) DAN
 * frontend (menentukan tombol aksi mana yang relevan ditampilkan per user —
 * keputusan akhir tetap divalidasi ulang di server). Named-role (Leader/SPV/
 * Director) di-resolve dari NAMA user aktif, pola yang sama dengan
 * `server/workspace/performance.ts` existing.
 */
export const COST_ROLE_NAMES = {
  LEADER: "Feny Nuraini",
  SPV: "Ni'mah Luthfianingsih",
  DIRECTOR: "Rahman Arief Dewantara",
} as const;

export type CostActorRole = "LEADER" | "SPV" | "DIRECTOR" | "OTHER";
export type CostApprovalStage = "LEADER_VERIFY" | "SPV_APPROVE" | "DIRECTOR_APPROVE";

function normalizeName(value: string): string {
  return value.trim().toLocaleUpperCase("id-ID");
}

export function resolveCostRole(name: string | null | undefined): CostActorRole {
  if (!name) return "OTHER";
  const normalized = normalizeName(name);
  if (normalized === normalizeName(COST_ROLE_NAMES.LEADER)) return "LEADER";
  if (normalized === normalizeName(COST_ROLE_NAMES.SPV)) return "SPV";
  if (normalized === normalizeName(COST_ROLE_NAMES.DIRECTOR)) return "DIRECTOR";
  return "OTHER";
}

/** Siapa boleh MEMBUAT pengajuan biaya — Leader/SPV/Direktur (§9.4). */
export function canCreateCost(role: CostActorRole): boolean {
  return role === "LEADER" || role === "SPV" || role === "DIRECTOR";
}

/**
 * Tahap approval berikutnya yang WAJIB dilalui, berdasarkan status saat ini
 * dan role pembuat. Submission pembuat dianggap keterlibatan perannya sendiri
 * sehingga tahap yang cocok dengan role pembuat DILEWATI:
 *  - Leader membuat -> lewati LEADER_VERIFY, langsung butuh SPV_APPROVE.
 *  - SPV membuat -> lewati SPV_APPROVE, langsung butuh DIRECTOR_APPROVE setelah LEADER_VERIFY.
 *  - Director membuat / pembuat lain (mis. ADMIN) -> rantai penuh (LEADER_VERIFY -> SPV_APPROVE -> DIRECTOR_APPROVE).
 * Mengembalikan null bila status tidak punya tahap approval berikutnya
 * (mis. DRAFT/REVISION_REQUESTED butuh submit dulu, atau sudah final).
 */
export function nextApprovalStage(status: WorkspaceCostStatus, creatorRole: CostActorRole): CostApprovalStage | null {
  if (status === "SUBMITTED") {
    return creatorRole === "LEADER" ? "SPV_APPROVE" : "LEADER_VERIFY";
  }
  if (status === "LEADER_VERIFIED") {
    return creatorRole === "SPV" ? "DIRECTOR_APPROVE" : "SPV_APPROVE";
  }
  if (status === "SPV_APPROVED") {
    return "DIRECTOR_APPROVE";
  }
  return null;
}

export function requiredApproverRole(stage: CostApprovalStage): Exclude<CostActorRole, "OTHER"> {
  if (stage === "LEADER_VERIFY") return "LEADER";
  if (stage === "SPV_APPROVE") return "SPV";
  return "DIRECTOR";
}

export function stageResultStatus(stage: CostApprovalStage): WorkspaceCostStatus {
  if (stage === "LEADER_VERIFY") return "LEADER_VERIFIED";
  if (stage === "SPV_APPROVE") return "SPV_APPROVED";
  return "DIRECTOR_APPROVED";
}

export const CANCELLABLE_STATUSES: readonly WorkspaceCostStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "LEADER_VERIFIED",
  "SPV_APPROVED",
  "REVISION_REQUESTED",
];

export const COM_ELIGIBLE_STATUS: WorkspaceCostStatus = "DIRECTOR_APPROVED";
