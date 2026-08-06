import { z } from "zod";

export const WORKSPACE_ITEM_TYPES = ["SALE", "BONUS", "SAMPLE"] as const;
export type WorkspaceItemType = (typeof WORKSPACE_ITEM_TYPES)[number];

/** RETURNED/REFUNDED/PARTIALLY_REFUNDED dihasilkan oleh import Database All
 *  (lihat pesanan-import.ts) ATAU aksi manual markOrderReturned/markOrderRefunded
 *  (lihat server/workspace/pesanan.ts, fitur Retur & Refund) — form CRUD manual
 *  Pesanan sendiri (create/update) hanya pernah membuat DRAFT/CONFIRMED/CANCELLED.
 *  Hanya CONFIRMED yang masuk KPI. */
export const WORKSPACE_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED", "RETURNED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export type WorkspaceOrderStatus = (typeof WORKSPACE_ORDER_STATUSES)[number];
/** Status yang dapat dipilih lewat form CRUD manual (create/update) Pesanan —
 *  subset dari WORKSPACE_ORDER_STATUSES. RETURNED/REFUNDED/PARTIALLY_REFUNDED
 *  diset lewat aksi terpisah (Tandai Retur/Refund), bukan field form ini. */
export const WORKSPACE_MANUAL_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;
/** Status yang dianggap "Retur & Refund" — dikeluarkan dari tab "Semua Pesanan"
 *  (yang hanya berisi pesanan AKTIF: DRAFT/CONFIRMED) dan jadi isi tab
 *  "Retur & Refund". CANCELLED sengaja ikut di sini (bukan cuma RETURNED/
 *  REFUNDED/PARTIALLY_REFUNDED) — di CRM ini, pesanan yang sudah dipesan bisa
 *  berujung batal/retur/refund kapan saja, dan ketiganya sama-sama "bukan lagi
 *  pesanan aktif", jadi digabung satu tempat alih-alih menumpuk di Semua
 *  Pesanan. Reklasifikasi ANTAR status di grup ini (mis. CANCELLED -> RETURNED)
 *  dibolehkan lewat markOrderReturned/markOrderRefunded/cancelWorkspaceOrder —
 *  satu-satunya yang tidak boleh jadi asal adalah DRAFT (lihat guard masing-
 *  masing fungsi di server/workspace/pesanan.ts). */
export const WORKSPACE_RETUR_REFUND_STATUSES = ["CANCELLED", "RETURNED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
/** Tab halaman Pesanan — 3 arah: "draft" = belum dikirim (status DRAFT,
 *  biasanya karena No Order/ID Pesanan Everpro belum diisi); "semua" = pesanan
 *  yang sudah berhasil dikirim (status CONFIRMED saja — default); "retur_refund"
 *  = WORKSPACE_RETUR_REFUND_STATUSES. Satu pesanan hanya pernah ada di SATU tab
 *  pada satu waktu, murni fungsi dari `status`-nya saat ini (lihat
 *  buildOrderConditions di server/workspace/pesanan.ts). */
export const WORKSPACE_PESANAN_TABS = ["draft", "semua", "retur_refund"] as const;
export type WorkspacePesananTab = (typeof WORKSPACE_PESANAN_TABS)[number];

export const WORKSPACE_PAYMENT_METHODS = ["COD", "TRANSFER"] as const;
export type WorkspacePaymentMethod = (typeof WORKSPACE_PAYMENT_METHODS)[number];

export const EXPEDITION_OPTIONS = ["JNE", "J&T", "SiCepat", "SAP", "Lainnya"] as const;
export const HUB_OPTIONS = ["JKT", "MKS"] as const;
export const SALES_TYPE_OPTIONS = ["CS", "NC", "Lainnya"] as const;
export const SALES_SOURCE_OPTIONS = ["Broadcast CRM", "WhatsApp", "Customer Lama", "Referral", "Meta", "Google", "Lainnya"] as const;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");
const money = z.coerce.number().int().min(0);

export const workspaceOrderItemBodySchema = z.object({
  productInternalId: z.coerce.number().int().positive(),
  itemType: z.enum(WORKSPACE_ITEM_TYPES),
  quantity: z.coerce.number().int().positive(),
});
export type WorkspaceOrderItemBody = z.infer<typeof workspaceOrderItemBodySchema>;

export const workspaceOrderBodySchema = z
  .object({
    orderDate: dateKey,
    /** No Order/ID Pesanan Everpro — diketik manual CRM, dipakai tracking data
     *  antar sistem. Opsional saat SIMPAN (pesanan boleh berhenti di DRAFT
     *  sampai nomornya didapat), tapi WAJIB terisi sebelum bisa dikonfirmasi
     *  (lihat guard di confirmWorkspaceOrder, server/workspace/pesanan.ts).
     *  Unik per (workspaceGeneration, sourceType='MANUAL') lewat constraint
     *  workspace_orders_source_id_uq yang sudah ada — mencegah CRM mengetik
     *  No Order yang sama dua kali tanpa sengaja. */
    sourceOrderId: z.string().trim().max(100).optional().nullable(),
    customerName: z.string().trim().min(1, "Nama Konsumen wajib diisi").max(200),
    phone: z.string().trim().min(1, "Nomor HP wajib diisi").max(30),
    address: z.string().trim().max(500).optional().nullable(),
    city: z.string().trim().max(120).optional().nullable(),
    district: z.string().trim().max(120).optional().nullable(),
    postalCode: z.string().trim().max(20).optional().nullable(),
    expedition: z.string().trim().max(60).optional().nullable(),
    hub: z.string().trim().max(60).optional().nullable(),
    paymentMethod: z.enum(WORKSPACE_PAYMENT_METHODS),
    memo: z.string().trim().max(200).optional().nullable(),
    partner: z.string().trim().max(120).optional().nullable(),
    crmUserId: z.coerce.number().int().positive(),
    salesType: z.string().trim().max(60).optional().nullable(),
    salesSource: z.string().trim().max(60).optional().nullable(),
    items: z.array(workspaceOrderItemBodySchema).min(1, "Minimal satu produk"),
    shippingCharge: money.default(0),
    packingCharge: money.default(0),
    discount: money.default(0),
    codAdmin: money.default(0),
    crmVoucher: money.default(0),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod === "TRANSFER" && value.codAdmin !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["codAdmin"], message: "Admin COD wajib Rp0 untuk pembayaran Transfer" });
    }
  });
export type WorkspaceOrderBody = z.infer<typeof workspaceOrderBodySchema>;

export const workspaceOrderFilterSchema = z
  .object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    customer: z.string().trim().max(200).optional(),
    crmUserId: z.coerce.number().int().positive().optional(),
    status: z.enum(WORKSPACE_ORDER_STATUSES).optional(),
    tab: z.enum(WORKSPACE_PESANAN_TABS).default("semua"),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().min(1).max(200).default(50),
  })
  .superRefine((value, ctx) => {
    if ((value.from && !value.to) || (!value.from && value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal from dan to wajib berpasangan" });
    }
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal awal tidak boleh melewati tanggal akhir" });
    }
  });
export type WorkspaceOrderFilter = z.infer<typeof workspaceOrderFilterSchema>;

export type WorkspaceOrderRow = {
  id: number;
  orderNumber: string;
  sourceOrderId: string | null;
  orderDate: string;
  customerName: string;
  phoneDisplay: string;
  crmNameSnapshot: string;
  productsSummary: string;
  totalQty: string;
  totalSalesValue: string;
  cos: string;
  paymentMethod: WorkspacePaymentMethod;
  orderTotal: string;
  status: WorkspaceOrderStatus;
  sourceType: string;
};

export type WorkspaceOrderItemDetail = {
  id: number;
  lineNo: number;
  productInternalId: number;
  productId: string;
  productNameSnapshot: string;
  itemType: WorkspaceItemType;
  quantity: string;
  sellingPriceSnapshot: string;
  unitHppSnapshot: string;
  totalSalesValue: string;
  totalHpp: string;
};

export type WorkspaceOrderDetail = {
  id: number;
  orderNumber: string;
  sourceType: string;
  sourceOrderId: string | null;
  orderDate: string;
  customerName: string;
  phoneDisplay: string;
  normalizedPhone: string;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  expedition: string | null;
  hub: string | null;
  paymentMethod: WorkspacePaymentMethod;
  memo: string | null;
  partner: string | null;
  crmUserId: number | null;
  crmNameSnapshot: string;
  salesType: string | null;
  salesSource: string | null;
  items: WorkspaceOrderItemDetail[];
  shippingCharge: string;
  packingCharge: string;
  discount: string;
  codAdmin: string;
  crmVoucher: string;
  totalSalesValue: string;
  orderTotal: string;
  codValue: string;
  cosSale: string;
  cosBonus: string;
  totalCos: string;
  status: WorkspaceOrderStatus;
  returnedAt: string | null;
  returnReason: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  refundAmount: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

/** MetricValue — nilai KPI yang bisa "N/A" dengan alasan eksplisit (docs
 *  prompt §6.2: COM/Pendapatan Bersih N/A saat filter Customer/CRM aktif). */
export type WorkspaceMetricValue = { value: string; available: boolean; label: string | null };

export type WorkspacePesananKpi = {
  jumlahCustomer: number;
  jumlahPesanan: number;
  totalSales: string;
  /** AOV = Total Sales ÷ Jumlah Pesanan CONFIRMED periode ini — lihat
   *  calculateAov() di lib/workspace-pesanan-calculation.ts untuk rumus persis. */
  aov: string;
  cos: string;
  com: WorkspaceMetricValue;
  pendapatanBersih: WorkspaceMetricValue;
  marginSebelumCom: string | null;
  comIsGlobal: boolean;
};

/** Body "Tandai Retur" — reason opsional, sama pola dengan cancelWorkspaceOrder. */
export const workspaceOrderReturnBodySchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceOrderReturnBody = z.infer<typeof workspaceOrderReturnBodySchema>;

/** Body "Tandai Refund" — refundAmount WAJIB (nilai refund yang valid, bukan
 *  ditebak). Pembanding refundAmount === orderTotal (REFUNDED penuh) vs < (
 *  PARTIALLY_REFUNDED) dihitung di server/workspace/pesanan.ts karena butuh
 *  orderTotal dari DB, bukan di sini. */
export const workspaceOrderRefundBodySchema = z.object({
  refundAmount: z.coerce.number().int().positive("Nominal refund wajib lebih dari 0"),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceOrderRefundBody = z.infer<typeof workspaceOrderRefundBodySchema>;

/** Body "Hapus Pesanan" (soft delete, checkbox/klik-kanan) — reason opsional,
 *  sama pola dengan cancel/retur. */
export const workspaceOrderDeleteBodySchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceOrderDeleteBody = z.infer<typeof workspaceOrderDeleteBodySchema>;

/** Status tujuan yang bisa diset lewat "Ubah Status Pesanan" (Edit Data) atau
 *  bulk "Pindahkan" (checkbox/klik-kanan) — DRAFT sengaja tidak termasuk,
 *  tidak ada jalur untuk mengembalikan pesanan ke DRAFT secara manual. */
export const WORKSPACE_ORDER_STATUS_CHANGE_TARGETS = ["CONFIRMED", "CANCELLED", "RETURNED", "REFUNDED"] as const;
export type WorkspaceOrderStatusChangeTarget = (typeof WORKSPACE_ORDER_STATUS_CHANGE_TARGETS)[number];

/** Target status yang valid dari status SAAT INI (fitur Retur & Refund
 *  dua-arah) — dipakai mengisi pilihan di panel "Ubah Status Pesanan" (Edit
 *  Data) supaya tidak menawarkan transisi yang pasti ditolak server. RETURNED/
 *  REFUNDED tidak ditawarkan dari DRAFT (pesanan yang belum pernah dikonfirmasi
 *  tidak pernah "berhasil"); selain itu bebas reklasifikasi ke status manapun
 *  kecuali dirinya sendiri, sesuai guard di server/workspace/pesanan.ts. */
export function availableStatusTargets(current: WorkspaceOrderStatus): WorkspaceOrderStatusChangeTarget[] {
  if (current === "DRAFT") return ["CONFIRMED", "CANCELLED"];
  return WORKSPACE_ORDER_STATUS_CHANGE_TARGETS.filter((target) => target !== current);
}

/** Label tampilan untuk tiap status tujuan — dipakai panel "Ubah Status
 *  Pesanan" (Edit Data) dan dialog "Pindahkan" massal (checkbox/klik-kanan),
 *  satu sumber supaya labelnya konsisten di kedua tempat. */
export const STATUS_TARGET_LABELS: Record<WorkspaceOrderStatusChangeTarget, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancel",
  RETURNED: "Retur",
  REFUNDED: "Refund (penuh)",
};

/** Target status yang ditawarkan bulk "Pindahkan" per tab (checkbox/klik-kanan
 *  Pesanan) — beda dari availableStatusTargets() karena ini per TAB (bisa
 *  mencakup baris dengan status awal berbeda-beda dalam satu bucket), bukan
 *  per baris. "draft" -> Confirmed (butuh No Order dulu) atau Cancel; "semua"
 *  (CONFIRMED) -> Cancel/Retur/Refund; "retur_refund" -> Confirmed saja
 *  (satu-satunya jalan balik ke Pesanan). */
export const MOVE_TARGETS_BY_TAB: Record<WorkspacePesananTab, WorkspaceOrderStatusChangeTarget[]> = {
  draft: ["CONFIRMED", "CANCELLED"],
  semua: ["CANCELLED", "RETURNED", "REFUNDED"],
  retur_refund: ["CONFIRMED"],
};

export const MOVE_LABEL_BY_TAB: Record<WorkspacePesananTab, string> = {
  draft: "Ubah Status",
  semua: "Pindahkan ke Retur & Refund",
  retur_refund: "Pindahkan ke Pesanan",
};

/** Body "Ubah Status Pesanan" massal (checkbox/klik-kanan) — dua arah:
 *  "Pindahkan ke Retur & Refund" (target CANCELLED/RETURNED/REFUNDED) dan
 *  "Pindahkan ke Pesanan" (target CONFIRMED, customer batal/retur/refund yang
 *  pesan lagi). Refund massal selalu penuh per baris (lihat markOrderRefunded
 *  di server/workspace/pesanan.ts) — satu reason berlaku untuk seluruh id. */
export const workspaceOrderBulkStatusChangeBodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "Pilih minimal satu pesanan"),
  target: z.enum(WORKSPACE_ORDER_STATUS_CHANGE_TARGETS),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceOrderBulkStatusChangeBody = z.infer<typeof workspaceOrderBulkStatusChangeBodySchema>;
