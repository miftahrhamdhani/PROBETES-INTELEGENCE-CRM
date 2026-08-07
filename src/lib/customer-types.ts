/**
 * SHARED — tipe daftar & detail customer, dipakai server query dan komponen UI.
 * Uang dikirim sebagai string rupiah mentah (bukan bigint) karena BigInt tidak
 * bisa diserialisasi ke Client Component; formatting dilakukan di UI.
 */
import type { ClusterAssignmentCode } from "./cluster-codes";
import type { MembershipStatusValue } from "./membership-contracts";

/** Kriteria drill-down. Satu bentuk untuk semua asal klik (cluster/cohort/frequency). */
export type CustomerListFilter = {
  /** Nama ATAU nomor HP — satu kolom pencarian (digabung sesuai permintaan). */
  search?: string;
  /** Nama CS — filter terpisah dari pencarian nama/HP. */
  cs?: string;
  /** Cluster code atau status non-cluster (mis. NEEDS_REVIEW). */
  cluster?: string;
  /** Status membership grup. "CONFLICT" bukan nilai DB — pseudo-filter untuk
   *  customer status=UNKNOWN yang masih punya data_quality_issues GROUP_STATUS_CONFLICT
   *  belum terselesaikan (lihat getMembershipSummary di analytics/customers.ts). */
  membershipStatus?: MembershipStatusValue | "CONFLICT";
  /** Nama PIC/CRM yang menangani customer ini. */
  pic?: string;
  /** Bulan first order 'YYYY-MM' — dipakai drill-down cohort & frequency. */
  cohortMonth?: string;
  /** Frequency tepat sama dengan angka ini. */
  frequency?: number;
  /** Frequency minimal (dipakai bucket F5+). */
  frequencyMin?: number;
  /**
   * Dipakai bersama cohortMonth: customer yang punya order di bulan
   * (cohortMonth + N). Sumber drill-down sel heatmap retention.
   */
  activeMonthIndex?: number;
  /** Dipakai bersama cohortMonth: customer yang mencapai order ke-N. */
  orderNumber?: number;
  /** Customer yang punya minimal satu order dalam rentang tanggal ini (inklusif). */
  orderDateFrom?: string;
  orderDateTo?: string;
  /** Drill-down heatmap RFM: rentang recency_days (inklusif). */
  recencyMin?: number;
  recencyMax?: number;
  /** Drill-down distribusi monetary RFM: rentang monetary rupiah (inklusif). */
  monetaryMin?: number;
  monetaryMax?: number;
  /** Default false — customer yang di-archive (soft delete operasional) disembunyikan
   *  dari list. Tidak pernah memengaruhi RFM/Cohort/Frequency/Cluster (tetap dihitung
   *  dari seluruh customer, lihat src/server/analytics/queries.ts). */
  includeArchived?: boolean;
  /** Customer yang first_seen_batch_id-nya = batch Database All aktif saat ini.
   *  Relatif terhadap batch aktif, bukan window hari — hilang otomatis begitu
   *  ada import berikutnya. Lihat buildConditions di analytics/customers.ts. */
  isNew?: boolean;
  page?: number;
  perPage?: number;
  /** Keyset cursor batch berikutnya (lihat encodeCursor di
   *  src/server/analytics/customers.ts). Kalau ada, COUNT tidak diulang. */
  cursor?: string;
};

export type CustomerListRow = {
  customerId: number;
  normalizedPhone: string;
  displayName: string;
  recencyDays: number | null;
  frequency: number;
  monetary: string;
  lastOrderDate: string | null;
  cohortMonth: string | null;
  clusterCode: ClusterAssignmentCode | null;
  membershipStatus: MembershipStatusValue;
  groupName: string | null;
  picName: string | null;
  csNames: string;
  /** Sumber/channel closing pertama (division order pertama dari Database All —
   *  mis. AKUISISI, CRM, TIKTOK, TIKTOK MP, MP, CS). */
  firstOrderDivision: string | null;
  /** Human-readable alasan NEEDS_REVIEW, null kalau cluster bukan NEEDS_REVIEW. */
  reviewReason: string | null;
  /** true kalau customer ini pertama kali muncul di batch Database All yang
   *  sedang aktif — dasar badge "Baru" di tabel Customers/Customer Cluster. */
  isNew: boolean;
};

export type CustomerListResult = {
  rows: CustomerListRow[];
  /** Dihitung HANYA pada batch pertama (tanpa cursor). Batch cursor berikutnya
   *  mengembalikan 0 — client mempertahankan nilai dari batch pertama supaya
   *  COUNT join penuh tidak diulang tiap scroll. */
  total: number;
  page: number;
  perPage: number;
  /** Penanda posisi batch berikutnya (keyset). null = sudah habis. */
  nextCursor: string | null;
};

export type CustomerOrderItem = {
  productCode: string;
  rawProductName: string;
  qty: string | null;
  amount: string;
  isBonus: boolean;
};

export type CustomerOrder = {
  orderId: number;
  orderDate: string;
  orderTotal: string;
  platform: string | null;
  /** Sumber/channel transaksi dari Database All (mis. AKUISISI, CRM, TIKTOK, TIKTOK MP, MP, CS). */
  division: string | null;
  paymentMethod: string | null;
  csName: string | null;
  items: CustomerOrderItem[];
};

/** Isi kolom reason JSONB — dipakai panel "Why this cluster?". */
export type ClusterReason = {
  matchedRule: string;
  priority: number | null;
  checks: { label: string; passed: boolean; actual: string | number | boolean | null }[];
  features?: Record<string, unknown>;
};

export type CustomerDetail = {
  customerId: number;
  normalizedPhone: string;
  displayPhone: string | null;
  displayName: string;
  /** Enrichment CRM — tidak pernah diisi dari import transaksi. */
  address: string | null;
  archivedAt: string | null;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  recencyDays: number | null;
  frequency: number;
  monetary: string;
  avgOrderValue: string | null;
  customerAgeDays: number | null;
  yaconaFrequency: number;
  cohortMonth: string | null;
  clusterCode: ClusterAssignmentCode | null;
  clusterAsOfDate: string | null;
  ruleVersion: string | null;
  reason: ClusterReason | null;
  membership: CustomerMembership;
  membershipHistory: { oldStatus: string | null; newStatus: string; source: string; changedAt: string; changedByName: string | null }[];
  orders: CustomerOrder[];
  clusterHistory: { clusterCode: string; validFrom: string; validTo: string | null }[];
};

/** Audit trail koreksi profil (nama/alamat/No HP) — src/server/customer/service.ts. */
export type CustomerProfileHistoryEntry = {
  id: number;
  field: "name" | "address" | "phone";
  oldValue: string | null;
  newValue: string | null;
  changedByName: string | null;
  changedAt: string;
};

export type CustomerMembership = {
  status: MembershipStatusValue;
  groupName: string | null;
  joinedAt: string | null;
  picUserId: number | null;
  picName: string | null;
  notes: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
};

/** Baris tabel Customer Cluster — kolom wajib halaman /cluster (beda fokus dari
 *  CustomerListRow: menonjolkan Total Fisik & Produk yang Dibeli, bukan R/F/M mentah). */
export type ClusterCustomerRow = {
  customerId: number;
  normalizedPhone: string;
  displayName: string;
  totalBelanja: string;
  totalFisik: string;
  frequency: number;
  recencyDays: number | null;
  firstOrderDate: string | null;
  membershipStatus: MembershipStatusValue;
  productsPurchased: string;
  csNames: string;
  /** Sama arti dengan CustomerListRow.isNew. */
  isNew: boolean;
};

export type ClusterCustomerListResult = {
  rows: ClusterCustomerRow[];
  /** Sama seperti CustomerListResult.total — hanya diisi pada batch pertama. */
  total: number;
  page: number;
  perPage: number;
  nextCursor: string | null;
};

export type ClusterDistributionItem = {
  code: string;
  customers: number;
  monetary: string;
};

/** 5 tile ringkasan halaman Group Membership — semua dihitung real-time dari Neon. */
export type MembershipSummary = {
  grouped: number;
  notGrouped: number;
  /** Termasuk customer TANPA baris membership sama sekali (no row = UNKNOWN secara semantik). */
  unknownOperational: number;
  /** Subset dari unknownOperational: sudah terdeteksi GROUP_STATUS_CONFLICT saat backfill DAN belum diselesaikan CRM. */
  unresolvedConflict: number;
  /** customer_cluster_current.cluster_code = NEEDS_REVIEW yang penyebabnya (juga) status grup UNKNOWN. */
  needsReviewMembership: number;
};
