"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import type { CrmPermission } from "@/lib/crm-permissions";
import {
  workspaceOrderBodySchema,
  workspaceOrderBulkStatusChangeBodySchema,
  workspaceOrderDeleteBodySchema,
  workspaceOrderFilterSchema,
  workspaceOrderRefundBodySchema,
  workspaceOrderReturnBodySchema,
} from "@/lib/workspace-pesanan-contracts";
import {
  bulkChangeOrderStatus,
  cancelWorkspaceOrder,
  confirmWorkspaceOrder,
  createWorkspaceOrder,
  deleteWorkspaceOrder,
  getWorkspaceOrder,
  getWorkspacePesananKpi,
  listActiveCrmUsers,
  listWorkspaceOrders,
  markOrderRefunded,
  markOrderReturned,
  updateWorkspaceOrder,
} from "@/server/workspace/pesanan";

export async function loadWorkspacePesananListAction(input: unknown) {
  await requireCrmPermission("crm.order.read");
  return listWorkspaceOrders(workspaceOrderFilterSchema.parse(input ?? {}));
}

export async function loadWorkspacePesananKpiAction(input: unknown) {
  await requireCrmPermission("crm.order.read");
  return getWorkspacePesananKpi(workspaceOrderFilterSchema.parse(input ?? {}));
}

export async function loadWorkspacePesananDetailAction(id: number) {
  await requireCrmPermission("crm.order.read");
  return getWorkspaceOrder(z.coerce.number().int().positive().parse(id));
}

export async function loadActiveCrmUsersAction() {
  await requireCrmPermission("crm.order.read");
  return listActiveCrmUsers();
}

/** `confirmImmediately` = tombol "Simpan & Konfirmasi" (beda dari "Simpan
 *  sebagai Draft") — butuh permission confirm juga, bukan cuma create, karena
 *  ini juga mengeksekusi transisi status DRAFT->CONFIRMED. */
export async function createWorkspacePesananAction(input: unknown, taskId?: number, confirmImmediately?: boolean) {
  const user = await requireCrmPermission("crm.order.create");
  if (confirmImmediately) await requireCrmPermission("crm.order.confirm");
  const body = workspaceOrderBodySchema.parse(input);
  return createWorkspaceOrder(body, Number(user.id), {
    taskId: taskId ? z.coerce.number().int().positive().parse(taskId) : undefined,
    confirmImmediately,
  });
}

export async function updateWorkspacePesananAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.order.update");
  const body = workspaceOrderBodySchema.parse(input);
  await updateWorkspaceOrder(z.coerce.number().int().positive().parse(id), body, Number(user.id));
}

/** Konfirmasi — dari DRAFT (alur normal) ATAU dari CANCELLED/RETURNED/REFUNDED/
 *  PARTIALLY_REFUNDED lewat panel "Ubah Status Pesanan" di Edit Data (customer
 *  yang tadinya batal/retur/refund pesan lagi). */
export async function confirmWorkspacePesananAction(id: number, reason?: string) {
  const user = await requireCrmPermission("crm.order.confirm");
  await confirmWorkspaceOrder(z.coerce.number().int().positive().parse(id), Number(user.id), reason?.trim() || null);
}

export async function cancelWorkspacePesananAction(id: number, reason?: string) {
  const user = await requireCrmPermission("crm.order.cancel");
  await cancelWorkspaceOrder(z.coerce.number().int().positive().parse(id), Number(user.id), reason?.trim() || null);
}

export async function markWorkspacePesananReturnedAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.order.return");
  const body = workspaceOrderReturnBodySchema.parse(input ?? {});
  await markOrderReturned(z.coerce.number().int().positive().parse(id), Number(user.id), body.reason?.trim() || null);
}

export async function markWorkspacePesananRefundedAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.order.refund");
  const body = workspaceOrderRefundBodySchema.parse(input);
  await markOrderRefunded(z.coerce.number().int().positive().parse(id), Number(user.id), BigInt(body.refundAmount), body.reason?.trim() || null);
}

export async function deleteWorkspacePesananAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.order.delete");
  const body = workspaceOrderDeleteBodySchema.parse(input ?? {});
  await deleteWorkspaceOrder(z.coerce.number().int().positive().parse(id), Number(user.id), body.reason?.trim() || null);
}

const PERMISSION_BY_STATUS_TARGET: Record<"CONFIRMED" | "CANCELLED" | "RETURNED" | "REFUNDED", CrmPermission> = {
  CONFIRMED: "crm.order.confirm",
  CANCELLED: "crm.order.cancel",
  RETURNED: "crm.order.return",
  REFUNDED: "crm.order.refund",
};

/** Ubah status banyak pesanan sekaligus (checkbox + klik-kanan/bulk toolbar) —
 *  dua arah: "Pindahkan ke Retur & Refund" (target CANCELLED/RETURNED/REFUNDED)
 *  dan "Pindahkan ke Pesanan" (target CONFIRMED). Permission dicek sesuai
 *  target yang dipilih (bukan satu permission generik) — mengubah ke CONFIRMED
 *  butuh crm.order.confirm, ke CANCELLED butuh crm.order.cancel, dst. Baris
 *  yang gagal (mis. masih DRAFT, sudah dihapus) dilaporkan balik ke caller,
 *  tidak menggagalkan baris lain yang eligible. */
export async function bulkChangeWorkspacePesananStatusAction(input: unknown) {
  const body = workspaceOrderBulkStatusChangeBodySchema.parse(input);
  const user = await requireCrmPermission(PERMISSION_BY_STATUS_TARGET[body.target]);
  return bulkChangeOrderStatus(body.ids, body.target, Number(user.id), body.reason?.trim() || null);
}
