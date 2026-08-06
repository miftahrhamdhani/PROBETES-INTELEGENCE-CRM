import type { UserRole } from "./roles";

export const CRM_PERMISSIONS = [
  "crm.manual_order.create",
  "crm.manual_order.update",
  "crm.manual_order.cancel",
  "crm.reconciliation.review",
  "crm.reconciliation.approve",
  "crm.reconciliation.reject",
  "crm.adjustment.create",
  "crm.adjustment.approve",
  "crm.task.assign",
  "crm.task.reassign",
  "crm.task.update_outcome",
  "crm.hpp.create",
  "crm.hpp.update",
  "crm.membership.update",
  "crm.official_order.read",
  "crm.metric.read",
  "crm.export",
  // Workspace CRM V1 (fresh start) — Pesanan / Master Data / Biaya Operasional.
  // Lihat docs prompt §11. Reads di-auto-grant ke role CRM lewat suffix ".read"
  // (roleHasCrmPermission di bawah); mutasi didaftar eksplisit di CRM_MUTATIONS
  // atau ADMIN_ONLY.
  "crm.workspace.overview.read",
  "crm.order.read",
  "crm.order.create",
  "crm.order.update",
  "crm.order.confirm",
  "crm.order.cancel",
  "crm.order.return",
  "crm.order.refund",
  "crm.order.delete",
  "crm.order.export",
  "crm.product.read",
  "crm.product.create",
  "crm.product.update",
  "crm.product.deactivate",
  "crm.com.read",
  "crm.com.create",
  "crm.com.update_own_draft",
  "crm.com.submit",
  "crm.com.leader_verify",
  "crm.com.spv_approve",
  "crm.com.director_approve",
  "crm.com.request_revision",
  "crm.com.reject",
  "crm.com.cancel",
  "crm.audit.read",
] as const;

export type CrmPermission = (typeof CRM_PERMISSIONS)[number];

const ADMIN_ONLY = new Set<CrmPermission>([
  "crm.reconciliation.review",
  "crm.reconciliation.approve",
  "crm.reconciliation.reject",
  "crm.adjustment.create",
  "crm.adjustment.approve",
  "crm.hpp.create",
  "crm.hpp.update",
  // Master Data harga jual/HPP sama sensitifnya dengan HPP mutation legacy
  // di atas — ADMIN saja, konsisten dengan precedent yang sudah ada.
  "crm.product.create",
  "crm.product.update",
  "crm.product.deactivate",
]);
const CRM_MUTATIONS = new Set<CrmPermission>([
  "crm.manual_order.create",
  "crm.manual_order.update",
  "crm.manual_order.cancel",
  "crm.task.assign",
  "crm.task.reassign",
  "crm.task.update_outcome",
  "crm.membership.update",
  "crm.order.create",
  "crm.order.update",
  "crm.order.confirm",
  "crm.order.cancel",
  "crm.order.return",
  "crm.order.refund",
  "crm.order.delete",
  "crm.order.export",
  // Aksi approval Biaya Operasional dibuka di level role (CRM) supaya user
  // bernama Feny/Ni'mah/Rahman (role CRM di tabel users) bisa mengaksesnya;
  // pengecekan SIAPA boleh menekan tombol tahap tertentu (Leader/SPV/Director)
  // dan larangan self-approval dilakukan di server/workspace/cost-workflow.ts,
  // bukan di layer permission role kasar ini.
  "crm.com.create",
  "crm.com.update_own_draft",
  "crm.com.submit",
  "crm.com.leader_verify",
  "crm.com.spv_approve",
  "crm.com.director_approve",
  "crm.com.request_revision",
  "crm.com.reject",
  "crm.com.cancel",
]);

/**
 * Domain CRM (termasuk PII customer di crm_reports/orders) hanya untuk ADMIN
 * dan CRM — sama seperti /workspace di roles.ts. MANAGEMENT dan role lain tidak
 * pernah mendapat permission apa pun di sini (lihat tests/server-action-security.test.ts
 * §"MANAGEMENT tidak boleh membaca PII").
 */
export function roleHasCrmPermission(role: UserRole, permission: CrmPermission): boolean {
  if (role === "ADMIN") return true;
  if (role !== "CRM") return false;
  if (ADMIN_ONLY.has(permission)) return false;
  return CRM_MUTATIONS.has(permission) || permission.endsWith(".read") || permission === "crm.export";
}
