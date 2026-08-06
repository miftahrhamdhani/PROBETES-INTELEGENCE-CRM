import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import { workspaceOrderItems, workspaceOrders } from "@/server/db/schema";
import { normalizePhone } from "@/server/normalize/phone";
import { createOrderFingerprint } from "@/server/workspace/classification";
import { allowedItemTypesForUsage } from "@/lib/workspace-product-seed";
import { calculateAov, calculateWorkspaceOrder } from "@/lib/workspace-pesanan-calculation";
import { getApprovedComForPeriod } from "@/server/workspace/costs";
import { activeGenerationCondition, notDeletedCondition } from "@/server/workspace/generation";
import { WORKSPACE_RETUR_REFUND_STATUSES } from "@/lib/workspace-pesanan-contracts";
import type {
  WorkspaceItemType,
  WorkspaceOrderBody,
  WorkspaceOrderDetail,
  WorkspaceOrderFilter,
  WorkspaceOrderItemBody,
  WorkspaceOrderRow,
  WorkspaceOrderStatus,
  WorkspacePesananKpi,
} from "@/lib/workspace-pesanan-contracts";

export class WorkspaceOrderNotFoundError extends Error {}
export class WorkspaceOrderValidationError extends Error {}
export class WorkspaceOrderStateError extends Error {}

/** `sourceOrderId` (No Order/ID Pesanan Everpro, diketik manual) unik per
 *  (workspaceGeneration, sourceType) lewat constraint workspace_orders_source_id_uq
 *  yang sudah ada — kalau CRM mengetik nomor yang sama dua kali, Postgres
 *  menolaknya sebagai unique_violation (23505). Diterjemahkan di sini jadi
 *  pesan yang bisa dibaca CRM, bukan raw DB error. */
function rethrowFriendlySourceOrderIdError(error: unknown): never {
  const code = (error as { code?: string } | null | undefined)?.code;
  const constraint = (error as { constraint?: string } | null | undefined)?.constraint;
  if (code === "23505" && constraint === "workspace_orders_source_id_uq") {
    throw new WorkspaceOrderValidationError("No Order/ID Pesanan ini sudah dipakai pesanan lain — cek lagi, mungkin salah ketik atau duplikat.");
  }
  throw error;
}

function txDb(client: TransactionClient) {
  return drizzle(client);
}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

type ResolvedItem = {
  productInternalId: number;
  productId: string;
  productNameSnapshot: string;
  itemType: WorkspaceItemType;
  quantity: bigint;
  sellingPriceSnapshot: bigint;
  unitHppSnapshot: bigint;
};

async function resolveOrderItems(client: TransactionClient, items: WorkspaceOrderItemBody[]): Promise<ResolvedItem[]> {
  const ids = [...new Set(items.map((item) => item.productInternalId))];
  const result = await client.query<{
    id: number;
    product_id: string;
    product_name: string;
    selling_price: string | null;
    unit_hpp: string;
    product_usage: string;
    is_active: boolean;
  }>(`SELECT id, product_id, product_name, selling_price, unit_hpp, product_usage, is_active FROM workspace_products WHERE id = ANY($1::int[])`, [ids]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));

  return items.map((item) => {
    const product = byId.get(item.productInternalId);
    if (!product) throw new WorkspaceOrderValidationError(`Produk (id ${item.productInternalId}) tidak ditemukan di Master Data`);
    if (!product.is_active) throw new WorkspaceOrderValidationError(`Produk ${product.product_name} tidak aktif`);
    const allowed = allowedItemTypesForUsage(product.product_usage as never);
    if (!allowed.includes(item.itemType)) {
      throw new WorkspaceOrderValidationError(
        `Produk ${product.product_name} (${product.product_usage}) tidak boleh dipilih sebagai ${item.itemType}`
      );
    }
    return {
      productInternalId: product.id,
      productId: product.product_id,
      productNameSnapshot: product.product_name,
      itemType: item.itemType,
      quantity: BigInt(item.quantity),
      sellingPriceSnapshot: item.itemType === "SALE" ? BigInt(product.selling_price ?? "0") : 0n,
      unitHppSnapshot: BigInt(product.unit_hpp),
    };
  });
}

/** Best-effort match by phone ke `customers` (registry identitas lintas modul)
 *  — nullable, murni untuk traceability, bukan sumber data pesanan itu sendiri. */
async function resolveCustomerId(client: TransactionClient, normalizedPhone: string): Promise<number | null> {
  const result = await client.query<{ id: number }>("SELECT id FROM customers WHERE normalized_phone = $1", [normalizedPhone]);
  return result.rows[0]?.id ?? null;
}

async function insertItems(client: TransactionClient, orderId: number, items: ResolvedItem[]) {
  const db = txDb(client);
  const calc = calculateWorkspaceOrder({
    items: items.map((item) => ({ itemType: item.itemType, quantity: item.quantity, sellingPrice: item.sellingPriceSnapshot, unitHpp: item.unitHppSnapshot })),
    shippingCharge: 0n,
    packingCharge: 0n,
    discount: 0n,
    codAdmin: 0n,
    crmVoucher: 0n,
    paymentMethod: "TRANSFER",
  });
  await db.insert(workspaceOrderItems).values(
    items.map((item, index) => ({
      orderId,
      lineNo: index + 1,
      productId: item.productInternalId,
      productNameSnapshot: item.productNameSnapshot,
      itemType: item.itemType,
      quantity: item.quantity.toString(),
      sellingPriceSnapshot: item.sellingPriceSnapshot,
      unitHppSnapshot: item.unitHppSnapshot,
      totalSalesValue: calc.items[index]!.totalSalesValue,
      totalHpp: calc.items[index]!.totalHpp,
    }))
  );
}

export async function createWorkspaceOrder(
  body: WorkspaceOrderBody,
  actorId: number,
  options?: { taskId?: number; confirmImmediately?: boolean }
): Promise<number> {
  const phone = normalizePhone(body.phone);
  if (phone.status !== "VALID") throw new WorkspaceOrderValidationError("Nomor HP tidak valid");
  const sourceOrderId = body.sourceOrderId?.trim() || null;
  // "Simpan & Konfirmasi" (tombol kedua di form Input Pesanan, selain "Simpan
  // sebagai Draft") — data harus LENGKAP (No Order sudah ada) sebelum bisa
  // langsung CONFIRMED, sama seperti syarat confirmWorkspaceOrder(). Dicek di
  // awal (bukan dalam transaksi) supaya tidak sempat membuat baris apa pun
  // kalau memang belum eligible — pengguna tinggal isi No Order dulu atau
  // pakai "Simpan sebagai Draft".
  if (options?.confirmImmediately && !sourceOrderId) {
    throw new WorkspaceOrderValidationError("No Order/ID Pesanan wajib diisi untuk langsung Konfirmasi — isi dulu, atau gunakan \"Simpan sebagai Draft\"");
  }
  const initialStatus: WorkspaceOrderStatus = options?.confirmImmediately ? "CONFIRMED" : "DRAFT";

  try {
    return await withTransaction(async (client) => {
      const db = txDb(client);
      const resolvedItems = await resolveOrderItems(client, body.items);
      const crmUser = await client.query<{ name: string }>(`SELECT name FROM users WHERE id = $1 AND active = true`, [body.crmUserId]);
      if (!crmUser.rows[0]) throw new WorkspaceOrderValidationError("Nama CRM tidak ditemukan atau tidak aktif");
      const crmName = crmUser.rows[0].name;

      const calc = calculateWorkspaceOrder({
        items: resolvedItems.map((item) => ({ itemType: item.itemType, quantity: item.quantity, sellingPrice: item.sellingPriceSnapshot, unitHpp: item.unitHppSnapshot })),
        shippingCharge: BigInt(body.shippingCharge),
        packingCharge: BigInt(body.packingCharge),
        discount: BigInt(body.discount),
        codAdmin: BigInt(body.codAdmin),
        crmVoucher: BigInt(body.crmVoucher),
        paymentMethod: body.paymentMethod,
      });

      const fingerprint = createOrderFingerprint({
        source: "CRM_MANUAL",
        orderDate: body.orderDate,
        normalizedPhone: phone.normalized,
        customerName: body.customerName,
        csName: crmName,
        total: calc.orderTotal,
        items: resolvedItems.map((item) => ({ product: item.productId, qty: item.quantity.toString(), amount: item.itemType === "SALE" ? item.sellingPriceSnapshot : 0n })),
      });
      const customerId = await resolveCustomerId(client, phone.normalized);

      const [inserted] = await db
        .insert(workspaceOrders)
        .values({
          orderNumber: `PENDING-${Date.now()}`,
          sourceType: "MANUAL",
          sourceOrderId,
          deterministicFingerprint: fingerprint,
          orderDate: body.orderDate,
          customerId,
          customerName: body.customerName,
          normalizedPhone: phone.normalized,
          phoneDisplay: body.phone,
          address: body.address ?? null,
          city: body.city ?? null,
          district: body.district ?? null,
          postalCode: body.postalCode ?? null,
          expedition: body.expedition ?? null,
          hub: body.hub ?? null,
          paymentMethod: body.paymentMethod,
          memo: body.memo ?? null,
          partner: body.partner ?? null,
          crmUserId: body.crmUserId,
          crmNameSnapshot: crmName,
          salesType: body.salesType ?? null,
          salesSource: body.salesSource ?? null,
          shippingCharge: BigInt(body.shippingCharge),
          packingCharge: BigInt(body.packingCharge),
          discount: BigInt(body.discount),
          codAdmin: calc.effectiveCodAdmin,
          crmVoucher: BigInt(body.crmVoucher),
          totalSalesValue: calc.totalSalesValue,
          orderTotal: calc.orderTotal,
          codValue: calc.codValue,
          status: initialStatus,
          confirmedAt: initialStatus === "CONFIRMED" ? new Date() : null,
          confirmedBy: initialStatus === "CONFIRMED" ? actorId : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: workspaceOrders.id });
      const orderId = inserted!.id;

      await client.query(`UPDATE workspace_orders SET order_number = 'PSN-' || lpad($2::text, 6, '0') WHERE id = $1`, [orderId, orderId]);
      await insertItems(client, orderId, resolvedItems);

      if (options?.taskId) {
        await client.query(`UPDATE crm_tasks SET workspace_order_id = $2, updated_at = now() WHERE id = $1`, [options.taskId, orderId]);
        await client.query(
          `INSERT INTO crm_task_activities (task_id, activity_type, detail, actor_user_id) VALUES ($1, 'LINKED_TO_WORKSPACE_ORDER', $2::jsonb, $3)`,
          [options.taskId, JSON.stringify({ workspaceOrderId: orderId }), actorId]
        );
      }

      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
         VALUES ($1, 'ORDER_CREATE', 'WORKSPACE_ORDER', $2, jsonb_build_object('orderTotal', $3::text, 'status', $4::text))`,
        [actorId, String(orderId), calc.orderTotal.toString(), initialStatus]
      );

      return orderId;
    });
  } catch (error) {
    rethrowFriendlySourceOrderIdError(error);
  }
}

async function loadOrderForUpdate(client: TransactionClient, id: number) {
  // `deleted_at IS NULL` di sini otomatis membuat SEMUA fungsi mutasi (confirm/
  // cancel/return/refund/update/delete) menolak baris yang sudah dihapus dengan
  // WorkspaceOrderNotFoundError, tanpa perlu diulang di tiap fungsi pemanggil.
  // `source_order_id` ikut diambil supaya confirmWorkspaceOrder bisa mewajibkan
  // No Order/ID Pesanan Everpro terisi sebelum status boleh jadi CONFIRMED.
  const result = await client.query<{ id: number; status: WorkspaceOrderStatus; order_total: string; source_order_id: string | null }>(
    `SELECT id, status, order_total::text, source_order_id FROM workspace_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new WorkspaceOrderNotFoundError();
  return row;
}

export async function updateWorkspaceOrder(id: number, body: WorkspaceOrderBody, actorId: number): Promise<void> {
  const phone = normalizePhone(body.phone);
  if (phone.status !== "VALID") throw new WorkspaceOrderValidationError("Nomor HP tidak valid");
  const sourceOrderId = body.sourceOrderId?.trim() || null;

  try {
    await withTransaction(async (client) => {
      // Edit dibolehkan untuk SEMUA status (bukan cuma DRAFT) — kesalahan input
      // manual masih sering terjadi walau pesanan sudah CONFIRMED/RETURNED/dst
      // (keputusan eksplisit, bukan default lama). loadOrderForUpdate tetap
      // menolak baris yang sudah dihapus (deleted_at IS NULL).
      const order = await loadOrderForUpdate(client, id);

      const resolvedItems = await resolveOrderItems(client, body.items);
      const crmUser = await client.query<{ name: string }>(`SELECT name FROM users WHERE id = $1 AND active = true`, [body.crmUserId]);
      if (!crmUser.rows[0]) throw new WorkspaceOrderValidationError("Nama CRM tidak ditemukan atau tidak aktif");
      const crmName = crmUser.rows[0].name;

      const calc = calculateWorkspaceOrder({
        items: resolvedItems.map((item) => ({ itemType: item.itemType, quantity: item.quantity, sellingPrice: item.sellingPriceSnapshot, unitHpp: item.unitHppSnapshot })),
        shippingCharge: BigInt(body.shippingCharge),
        packingCharge: BigInt(body.packingCharge),
        discount: BigInt(body.discount),
        codAdmin: BigInt(body.codAdmin),
        crmVoucher: BigInt(body.crmVoucher),
        paymentMethod: body.paymentMethod,
      });
      const fingerprint = createOrderFingerprint({
        source: "CRM_MANUAL",
        orderDate: body.orderDate,
        normalizedPhone: phone.normalized,
        customerName: body.customerName,
        csName: crmName,
        total: calc.orderTotal,
        items: resolvedItems.map((item) => ({ product: item.productId, qty: item.quantity.toString(), amount: item.itemType === "SALE" ? item.sellingPriceSnapshot : 0n })),
      });

      // Kalau No Order dikosongkan pada pesanan yang statusnya sudah bukan
      // DRAFT (mis. koreksi No Order yang ternyata salah), status HARUS ikut
      // turun ke DRAFT — CHECK workspace_orders_status_requires_source_order_id_ck
      // di schema.ts menolak kombinasi status non-DRAFT + source_order_id NULL,
      // dan secara bisnis memang begitu (No Order adalah kunci "trackable").
      // Metadata transisi lama (confirmed/cancelled/returned/refunded) ikut
      // dibersihkan supaya tidak ada jejak basi yang menempel di status DRAFT.
      const demotedToDraft = !sourceOrderId && order.status !== "DRAFT";

      const customerId = await resolveCustomerId(client, phone.normalized);
      const db = txDb(client);
      await db
        .update(workspaceOrders)
        .set({
          orderDate: body.orderDate,
          customerId,
          customerName: body.customerName,
          normalizedPhone: phone.normalized,
          phoneDisplay: body.phone,
          address: body.address ?? null,
          city: body.city ?? null,
          district: body.district ?? null,
          postalCode: body.postalCode ?? null,
          expedition: body.expedition ?? null,
          hub: body.hub ?? null,
          paymentMethod: body.paymentMethod,
          memo: body.memo ?? null,
          partner: body.partner ?? null,
          crmUserId: body.crmUserId,
          crmNameSnapshot: crmName,
          salesType: body.salesType ?? null,
          salesSource: body.salesSource ?? null,
          shippingCharge: BigInt(body.shippingCharge),
          packingCharge: BigInt(body.packingCharge),
          discount: BigInt(body.discount),
          codAdmin: calc.effectiveCodAdmin,
          crmVoucher: BigInt(body.crmVoucher),
          totalSalesValue: calc.totalSalesValue,
          orderTotal: calc.orderTotal,
          codValue: calc.codValue,
          deterministicFingerprint: fingerprint,
          sourceOrderId,
          updatedBy: actorId,
          updatedAt: new Date(),
          ...(demotedToDraft
            ? {
                status: "DRAFT" as const,
                confirmedAt: null,
                confirmedBy: null,
                cancelledAt: null,
                cancelledBy: null,
                cancelReason: null,
                returnedAt: null,
                returnedBy: null,
                returnReason: null,
                refundedAt: null,
                refundedBy: null,
                refundReason: null,
                refundAmount: null,
              }
            : {}),
        })
        .where(eq(workspaceOrders.id, id));

      await db.delete(workspaceOrderItems).where(eq(workspaceOrderItems.orderId, id));
      await insertItems(client, id, resolvedItems);

      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
         VALUES ($1, 'ORDER_UPDATE', 'WORKSPACE_ORDER', $2, jsonb_build_object('orderTotal', $3::text), jsonb_build_object('orderTotal', $4::text))`,
        [actorId, String(id), order.order_total, calc.orderTotal.toString()]
      );

      if (demotedToDraft) {
        await client.query(
          `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
           VALUES ($1, 'ORDER_STATUS_RESET_TO_DRAFT', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status','DRAFT'), $4)`,
          [actorId, String(id), order.status, "No Order/ID Pesanan dikosongkan"]
        );
      }
    });
  } catch (error) {
    rethrowFriendlySourceOrderIdError(error);
  }
}

/** Konfirmasi — dari DRAFT (alur normal) ATAU dari CANCELLED/RETURNED/
 *  REFUNDED/PARTIALLY_REFUNDED (fitur Retur & Refund: customer yang tadinya
 *  batal/retur/refund bisa berubah pikiran dan pesan lagi — "Pindahkan ke
 *  Pesanan"). `confirmed_at/by` selalu ditimpa ke kejadian konfirmasi
 *  TERBARU. Begitu status CONFIRMED, pesanan otomatis balik ke tab "Semua
 *  Pesanan" (tidak lagi termasuk WORKSPACE_RETUR_REFUND_STATUSES).
 *
 *  WAJIB `source_order_id` (No Order/ID Pesanan Everpro) sudah terisi — ini
 *  kunci tracking data lintas sistem, jadi pesanan tanpa nomor itu tidak boleh
 *  dianggap "berhasil". Pesanan tanpa No Order tetap DRAFT (tab "Draft
 *  Pesanan") sampai CRM mengisinya lewat Edit Data. */
export async function confirmWorkspaceOrder(id: number, actorId: number, reason: string | null = null): Promise<void> {
  await withTransaction(async (client) => {
    const order = await loadOrderForUpdate(client, id);
    if (order.status === "CONFIRMED") throw new WorkspaceOrderStateError("Pesanan sudah berstatus CONFIRMED");
    if (!order.source_order_id?.trim()) {
      throw new WorkspaceOrderValidationError("No Order/ID Pesanan wajib diisi dulu (lewat Edit Data) sebelum pesanan bisa dikonfirmasi");
    }
    await client.query(`UPDATE workspace_orders SET status='CONFIRMED', confirmed_at=now(), confirmed_by=$2, updated_at=now() WHERE id=$1`, [id, actorId]);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, 'ORDER_CONFIRM', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status','CONFIRMED'), $4)`,
      [actorId, String(id), order.status, reason]
    );
  });
}

/** WAJIB `source_order_id` (No Order/ID Pesanan Everpro) sudah terisi — sama
 *  seperti confirmWorkspaceOrder, supaya TIDAK PERNAH ada baris CANCELLED
 *  tanpa No Order (ditegakkan juga oleh CHECK workspace_orders_status_requires_
 *  source_order_id_ck di schema.ts). Draft yang tidak jadi (belum ada No Order
 *  sama sekali) cukup DIHAPUS (deleteWorkspaceOrder), bukan dibatalkan —
 *  "batal" berarti sempat jadi pesanan trackable lalu batal, bukan sekadar
 *  draft yang tidak pernah lanjut. */
export async function cancelWorkspaceOrder(id: number, actorId: number, reason: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const order = await loadOrderForUpdate(client, id);
    if (order.status === "CANCELLED") throw new WorkspaceOrderStateError("Pesanan sudah dibatalkan");
    if (!order.source_order_id?.trim()) {
      throw new WorkspaceOrderValidationError(
        "No Order/ID Pesanan belum diisi — draft yang tidak jadi cukup dihapus (Hapus Pesanan), bukan dibatalkan"
      );
    }
    await client.query(`UPDATE workspace_orders SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2, cancel_reason=$3, updated_at=now() WHERE id=$1`, [id, actorId, reason]);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, 'ORDER_CANCEL', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status','CANCELLED'), $4)`,
      [actorId, String(id), order.status, reason]
    );
  });
}

/** "Tandai Retur" manual — dari status apa pun KECUALI DRAFT (pesanan yang
 *  belum pernah dikonfirmasi tidak pernah "berhasil", jadi tidak bisa diretur).
 *  Termasuk reklasifikasi dari CANCELLED/REFUNDED/PARTIALLY_REFUNDED ke
 *  RETURNED — di CRM ini, pesanan yang sudah dipesan bisa berujung batal/
 *  retur/refund kapan saja dan sering perlu dikoreksi antar ketiganya.
 *  Begitu status berubah, pesanan otomatis hilang dari KPI & tab "Semua
 *  Pesanan" (keduanya memfilter `status = 'CONFIRMED'`/tidak termasuk
 *  WORKSPACE_RETUR_REFUND_STATUSES) tanpa logic eksklusi baru. */
export async function markOrderReturned(id: number, actorId: number, reason: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const order = await loadOrderForUpdate(client, id);
    if (order.status === "DRAFT") throw new WorkspaceOrderStateError("Pesanan DRAFT harus dikonfirmasi dulu sebelum bisa ditandai retur");
    await client.query(
      `UPDATE workspace_orders SET status='RETURNED', returned_at=now(), returned_by=$2, return_reason=$3, updated_at=now() WHERE id=$1`,
      [id, actorId, reason]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, 'ORDER_RETURN', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status','RETURNED'), $4)`,
      [actorId, String(id), order.status, reason]
    );
  });
}

/** "Tandai Refund" manual — dari status apa pun kecuali DRAFT (sama alasan
 *  dengan retur di atas). `refundAmount` yang SAMA dengan order_total ->
 *  REFUNDED (refund penuh); kurang dari itu -> PARTIALLY_REFUNDED dengan
 *  refund_amount tersimpan (ATURAN: PARTIALLY_REFUNDED tidak boleh dihitung
 *  tanpa nilai refund yang valid). `refundAmount === "FULL"` dipakai jalur
 *  massal (bulkChangeOrderStatus) — tidak masuk akal minta satu nominal untuk
 *  banyak pesanan dengan TOTAL berbeda-beda, jadi refund massal SELALU penuh
 *  per baris; refund sebagian tetap hanya lewat aksi satu-per-satu. */
export async function markOrderRefunded(id: number, actorId: number, refundAmount: bigint | "FULL", reason: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const order = await loadOrderForUpdate(client, id);
    if (order.status === "DRAFT") throw new WorkspaceOrderStateError("Pesanan DRAFT harus dikonfirmasi dulu sebelum bisa ditandai refund");
    const orderTotal = BigInt(order.order_total);
    const amount = refundAmount === "FULL" ? orderTotal : refundAmount;
    if (amount <= 0n) throw new WorkspaceOrderValidationError("Nominal refund wajib lebih dari 0");
    if (amount > orderTotal) throw new WorkspaceOrderValidationError("Nominal refund tidak boleh melebihi TOTAL pesanan");
    const finalStatus: WorkspaceOrderStatus = amount === orderTotal ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await client.query(
      `UPDATE workspace_orders SET status=$2, refunded_at=now(), refunded_by=$3, refund_reason=$4, refund_amount=$5, updated_at=now() WHERE id=$1`,
      [id, finalStatus, actorId, reason, amount.toString()]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, 'ORDER_REFUND', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status',$4::text,'refundAmount',$5::text), $6)`,
      [actorId, String(id), order.status, finalStatus, amount.toString(), reason]
    );
  });
}

export type BulkOrderStatusTarget = "CONFIRMED" | "CANCELLED" | "RETURNED" | "REFUNDED";

/** Ubah status banyak pesanan sekaligus (checkbox + klik-kanan/bulk toolbar,
 *  dua arah: "Pindahkan ke Retur & Refund" — target CANCELLED/RETURNED/REFUNDED
 *  — dan "Pindahkan ke Pesanan" — target CONFIRMED, dipakai saat customer yang
 *  tadinya batal/retur/refund pesan lagi). Loop per baris memanggil fungsi
 *  single yang sama dengan aksi di Edit Data, masing-masing transaksi sendiri,
 *  supaya baris yang tidak eligible tidak menggagalkan yang lain. Refund
 *  massal selalu penuh per baris (lihat markOrderRefunded). */
export async function bulkChangeOrderStatus(
  ids: number[],
  target: BulkOrderStatusTarget,
  actorId: number,
  reason: string | null
): Promise<{ succeeded: number[]; failed: { id: number; error: string }[] }> {
  const succeeded: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      if (target === "CONFIRMED") await confirmWorkspaceOrder(id, actorId, reason);
      else if (target === "CANCELLED") await cancelWorkspaceOrder(id, actorId, reason);
      else if (target === "RETURNED") await markOrderReturned(id, actorId, reason);
      else await markOrderRefunded(id, actorId, "FULL", reason);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : "Gagal mengubah status" });
    }
  }
  return { succeeded, failed };
}

/** Soft delete (fitur checkbox/klik-kanan Pesanan §"Edit Data") — status tetap
 *  apa adanya, hanya deleted_at/by/reason yang diisi. Baris & jejak audit tidak
 *  pernah hilang dari database (lihat komentar di schema.ts), tapi otomatis
 *  hilang dari SELURUH query baca lewat notDeletedCondition(). Berlaku untuk
 *  status apa pun (keputusan eksplisit, bukan dibatasi DRAFT/CONFIRMED saja). */
export async function deleteWorkspaceOrder(id: number, actorId: number, reason: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const order = await loadOrderForUpdate(client, id);
    await client.query(`UPDATE workspace_orders SET deleted_at=now(), deleted_by=$2, delete_reason=$3, updated_at=now() WHERE id=$1`, [id, actorId, reason]);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, 'ORDER_DELETE', 'WORKSPACE_ORDER', $2, jsonb_build_object('status',$3::text), jsonb_build_object('deleted', true), $4)`,
      [actorId, String(id), order.status, reason]
    );
  });
}

function buildOrderConditions(filter: WorkspaceOrderFilter): SQL[] {
  // Generation aktif + belum dihapus SELALU jadi kondisi pertama — daftar, KPI,
  // dan export semuanya lewat sini, jadi tidak ada jalur yang bisa lupa memfilternya.
  const conditions: SQL[] = [activeGenerationCondition("o"), notDeletedCondition("o")];
  if (filter.from) conditions.push(sql`o.order_date >= ${filter.from}::date`);
  if (filter.to) conditions.push(sql`o.order_date <= ${filter.to}::date`);
  if (filter.customer?.trim()) {
    const search = `%${filter.customer.trim()}%`;
    conditions.push(sql`(o.customer_name ILIKE ${search} OR o.phone_display ILIKE ${search} OR o.normalized_phone LIKE ${search})`);
  }
  if (filter.crmUserId) conditions.push(sql`o.crm_user_id = ${filter.crmUserId}`);
  // 3 tab (lihat WorkspacePesananTab) — TIDAK murni fungsi `status`, tapi juga
  // `source_order_id` (No Order/ID Pesanan Everpro): pesanan TANPA No Order
  // SELALU masuk "Draft Pesanan" apapun status-nya di kolom `status` (mis.
  // baris lama yang sempat CONFIRMED sebelum aturan ini ada, atau CANCELLED
  // langsung dari DRAFT tanpa pernah dikonfirmasi) — No Order adalah kunci
  // tracking ke Everpro, jadi tanpa itu belum bisa dianggap "berhasil".
  // "semua" = CONFIRMED **dan** No Order sudah ada; "retur_refund" = status
  // WORKSPACE_RETUR_REFUND_STATUSES **dan** No Order sudah ada. Ketiga bucket
  // ini saling lepas & menutup semua kemungkinan (tidak ada baris yang jatuh
  // di luar ketiganya) — lihat tests/workspace-pesanan.test.ts untuk buktinya.
  // Dropdown status (bila diisi) tetap berlaku sebagai penyaring TAMBAHAN.
  if (filter.tab === "draft") {
    conditions.push(sql`(o.status = 'DRAFT' OR o.source_order_id IS NULL)`);
  } else if (filter.tab === "semua") {
    conditions.push(sql`o.status = 'CONFIRMED' AND o.source_order_id IS NOT NULL`);
  } else {
    const returStatuses = sql.join(
      WORKSPACE_RETUR_REFUND_STATUSES.map((s) => sql`${s}::workspace_order_status`),
      sql`, `
    );
    conditions.push(sql`o.status IN (${returStatuses}) AND o.source_order_id IS NOT NULL`);
  }
  if (filter.status) conditions.push(sql`o.status = ${filter.status}::workspace_order_status`);
  return conditions;
}

export async function listWorkspaceOrders(filter: WorkspaceOrderFilter): Promise<{ rows: WorkspaceOrderRow[]; total: number }> {
  const conditions = buildOrderConditions(filter);
  const where = conditions.length ? andAll(conditions) : sql`true`;
  const perPage = filter.perPage;
  const offset = (filter.page - 1) * perPage;
  // Total dihitung query terpisah, BUKAN `COUNT(*) OVER()`: window count ikut
  // hilang saat halaman berada di luar rentang (rows kosong -> total 0), yang
  // membuat kontrol pagination mengira datanya habis dan operator terjebak di
  // halaman kosong. Query ini jalan paralel dengan query baris, jadi tidak
  // menambah round trip secara wall-clock.
  const [result, countResult] = await Promise.all([
    getDb().execute<{
    id: number;
    order_number: string;
    source_order_id: string | null;
    order_date: string;
    customer_name: string;
    phone_display: string | null;
    crm_name_snapshot: string;
    products_summary: string | null;
    total_qty: string;
    total_sales_value: string;
    cos: string;
    payment_method: WorkspaceOrderRow["paymentMethod"];
    order_total: string;
    status: WorkspaceOrderStatus;
    source_type: string;
  }>(sql`
    SELECT o.id::int AS id, o.order_number, o.source_order_id, o.order_date::text, o.customer_name, o.phone_display, o.crm_name_snapshot,
      string_agg(i.product_name_snapshot || CASE WHEN i.item_type <> 'SALE' THEN ' — ' || i.item_type ELSE '' END || ' x' || i.quantity::text, E'\n' ORDER BY i.line_no) AS products_summary,
      COALESCE(SUM(i.quantity), 0)::text AS total_qty,
      o.total_sales_value::text, COALESCE(SUM(i.total_hpp), 0)::text AS cos,
      o.payment_method::text AS payment_method, o.order_total::text, o.status::text AS status, o.source_type
    FROM workspace_orders o LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${where}
    GROUP BY o.id
    ORDER BY o.order_date DESC, o.id DESC
    LIMIT ${perPage} OFFSET ${offset}
  `),
    // Kondisi filter hanya menyentuh `o`, jadi count cukup atas workspace_orders
    // saja — tidak perlu ikut join item (yang justru melipatgandakan baris).
    getDb().execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM workspace_orders o WHERE ${where}`),
  ]);
  return {
    rows: result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      sourceOrderId: row.source_order_id,
      orderDate: row.order_date,
      customerName: row.customer_name,
      phoneDisplay: row.phone_display ?? "",
      crmNameSnapshot: row.crm_name_snapshot,
      productsSummary: row.products_summary ?? "—",
      totalQty: row.total_qty,
      totalSalesValue: row.total_sales_value,
      cos: row.cos,
      paymentMethod: row.payment_method,
      orderTotal: row.order_total,
      status: row.status,
      sourceType: row.source_type,
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getWorkspaceOrder(id: number): Promise<WorkspaceOrderDetail | null> {
  const [headerResult, itemsResult] = await Promise.all([
    getDb().execute<Record<string, unknown>>(sql`
      SELECT o.*, creator.name AS created_by_name
      FROM workspace_orders o LEFT JOIN users creator ON creator.id = o.created_by
      WHERE o.id = ${id} AND ${activeGenerationCondition("o")} AND ${notDeletedCondition("o")}
    `),
    getDb().execute<{
      id: number;
      line_no: number;
      product_id: number;
      product_id_text: string;
      product_name_snapshot: string;
      item_type: WorkspaceItemType;
      quantity: string;
      selling_price_snapshot: string;
      unit_hpp_snapshot: string;
      total_sales_value: string;
      total_hpp: string;
    }>(sql`
      SELECT i.id, i.line_no, i.product_id, p.product_id AS product_id_text, i.product_name_snapshot, i.item_type::text AS item_type,
        i.quantity::text, i.selling_price_snapshot::text, i.unit_hpp_snapshot::text, i.total_sales_value::text, i.total_hpp::text
      FROM workspace_order_items i LEFT JOIN workspace_products p ON p.id = i.product_id
      WHERE i.order_id = ${id} ORDER BY i.line_no
    `),
  ]);
  const row = headerResult.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const cosSale = itemsResult.rows.filter((i) => i.item_type === "SALE").reduce((sum, i) => sum + BigInt(i.total_hpp), 0n);
  const cosBonus = itemsResult.rows.filter((i) => i.item_type !== "SALE").reduce((sum, i) => sum + BigInt(i.total_hpp), 0n);

  return {
    id: Number(row.id),
    orderNumber: String(row.order_number),
    sourceType: String(row.source_type),
    sourceOrderId: (row.source_order_id as string) ?? null,
    orderDate: String(row.order_date),
    customerName: String(row.customer_name),
    phoneDisplay: (row.phone_display as string) ?? "",
    normalizedPhone: String(row.normalized_phone),
    address: (row.address as string) ?? null,
    city: (row.city as string) ?? null,
    district: (row.district as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    expedition: (row.expedition as string) ?? null,
    hub: (row.hub as string) ?? null,
    paymentMethod: row.payment_method as WorkspaceOrderDetail["paymentMethod"],
    memo: (row.memo as string) ?? null,
    partner: (row.partner as string) ?? null,
    crmUserId: (row.crm_user_id as number) ?? null,
    crmNameSnapshot: String(row.crm_name_snapshot),
    salesType: (row.sales_type as string) ?? null,
    salesSource: (row.sales_source as string) ?? null,
    items: itemsResult.rows.map((item) => ({
      id: Number(item.id),
      lineNo: item.line_no,
      productInternalId: item.product_id,
      productId: item.product_id_text,
      productNameSnapshot: item.product_name_snapshot,
      itemType: item.item_type,
      quantity: item.quantity,
      sellingPriceSnapshot: item.selling_price_snapshot,
      unitHppSnapshot: item.unit_hpp_snapshot,
      totalSalesValue: item.total_sales_value,
      totalHpp: item.total_hpp,
    })),
    shippingCharge: String(row.shipping_charge),
    packingCharge: String(row.packing_charge),
    discount: String(row.discount),
    codAdmin: String(row.cod_admin),
    crmVoucher: String(row.crm_voucher),
    totalSalesValue: String(row.total_sales_value),
    orderTotal: String(row.order_total),
    codValue: String(row.cod_value),
    cosSale: cosSale.toString(),
    cosBonus: cosBonus.toString(),
    totalCos: (cosSale + cosBonus).toString(),
    status: row.status as WorkspaceOrderStatus,
    returnedAt: row.returned_at ? String(row.returned_at) : null,
    returnReason: (row.return_reason as string) ?? null,
    refundedAt: row.refunded_at ? String(row.refunded_at) : null,
    refundReason: (row.refund_reason as string) ?? null,
    refundAmount: row.refund_amount != null ? String(row.refund_amount) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdByName: (row.created_by_name as string) ?? null,
  };
}

export async function listActiveCrmUsers(): Promise<{ id: number; name: string }[]> {
  const result = await getDb().execute<{ id: number; name: string }>(
    sql`SELECT id, name FROM users WHERE role = 'CRM' AND active = true ORDER BY name`
  );
  return result.rows;
}

/** KPI Pesanan/Overview (docs prompt §4, §6.2). `dimensionFilterActive` = filter
 *  Customer atau CRM sedang dipakai -> COM jadi "global", Pendapatan Bersih N/A. */
export async function getWorkspacePesananKpi(filter: WorkspaceOrderFilter): Promise<WorkspacePesananKpi> {
  const conditions = [...buildOrderConditions(filter), sql`o.status = 'CONFIRMED'`];
  const where = andAll(conditions);
  // COM independen dari agregasi order — paralel, bukan berurutan.
  const [result, com] = await Promise.all([
    getDb().execute<{
      jumlah_customer: string;
      jumlah_pesanan: string;
      nilai_transaksi: string;
      total_sales: string;
      cos: string;
    }>(sql`
    SELECT COUNT(DISTINCT o.normalized_phone)::text AS jumlah_customer,
      COUNT(DISTINCT o.id)::text AS jumlah_pesanan,
      COALESCE(SUM(o.order_total), 0)::text AS nilai_transaksi,
      COALESCE(SUM(i.total_sales_value), 0)::text AS total_sales,
      COALESCE(SUM(i.total_hpp), 0)::text AS cos
    FROM workspace_orders o LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${where}
  `),
    getApprovedComForPeriod(filter.from, filter.to),
  ]);
  const row = result.rows[0];
  const nilaiTransaksi = BigInt(row?.nilai_transaksi ?? "0");
  const totalSales = BigInt(row?.total_sales ?? "0");
  const cos = BigInt(row?.cos ?? "0");
  const jumlahPesanan = Number(row?.jumlah_pesanan ?? 0);
  const aov = calculateAov(totalSales, jumlahPesanan).toString();

  const dimensionFilterActive = Boolean(filter.customer?.trim() || filter.crmUserId);
  if (dimensionFilterActive) {
    return {
      jumlahCustomer: Number(row?.jumlah_customer ?? 0),
      jumlahPesanan,
      totalSales: row?.total_sales ?? "0",
      aov,
      cos: row?.cos ?? "0",
      com: { value: com.toString(), available: true, label: "COM Periode — Global" },
      pendapatanBersih: { value: "0", available: false, label: "COM belum dialokasikan per customer atau CRM." },
      marginSebelumCom: (nilaiTransaksi - cos).toString(),
      comIsGlobal: true,
    };
  }
  return {
    jumlahCustomer: Number(row?.jumlah_customer ?? 0),
    jumlahPesanan,
    totalSales: row?.total_sales ?? "0",
    aov,
    cos: row?.cos ?? "0",
    com: { value: com.toString(), available: true, label: null },
    pendapatanBersih: { value: (nilaiTransaksi - cos - com).toString(), available: true, label: null },
    marginSebelumCom: null,
    comIsGlobal: false,
  };
}
