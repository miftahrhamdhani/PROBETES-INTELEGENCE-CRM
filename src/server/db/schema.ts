import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ClusterAssignmentCode } from "@/lib/cluster-codes";

export const userRole = pgEnum("user_role", ["ADMIN", "CRM", "MANAGEMENT"]);
export const importSourceType = pgEnum("import_source_type", [
  "DATABASE_ALL",
  "KSB",
  "GROUP_LIST",
]);
export const importStatus = pgEnum("import_status", [
  "UPLOADING",
  "STAGED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const validationStatus = pgEnum("validation_status", [
  "VALID",
  "EXCLUDED",
  "NEEDS_REVIEW",
]);
export const issueType = pgEnum("issue_type", [
  "MISSING_PHONE",
  "INVALID_PHONE",
  /** Nama customer kosong — bersama MISSING_PHONE/INVALID_PHONE/INVALID_DATE,
   *  ini IMPORT EXCLUSION: baris tidak pernah jadi canonical customer/order sama
   *  sekali (lihat docs/07-OPEN-QUESTIONS.md "Populasi CRM final"). Beda dari
   *  NEEDS_REVIEW yang untuk customer yang SUDAH valid tapi punya isu lain. */
  "MISSING_NAME",
  "MISSING_ORDER_ID",
  "DUPLICATE_ORDER",
  "UNKNOWN_PRODUCT",
  "AMOUNT_CONFLICT",
  "INVALID_DATE",
  "NEEDS_REVIEW",
  /** Baris Legacy KSB yang product_family-nya BUKAN KSB (mis. PBH 70 -> HERBAL_PROBETES).
   *  Tidak masuk ksb_transactions/Cluster B/RFM — dicatat di sini murni untuk audit. */
  "SKIPPED_NON_KSB_FROM_LEGACY",
  /** Nomor HP ada di masukWA/BackupMasukGrup (GROUPED) DAN tidakmasukWA (NOT_GROUPED)
   *  sekaligus, tanpa timestamp untuk menentukan yang terbaru — diset UNKNOWN,
   *  butuh keputusan manual CRM. Lihat scripts/import-legacy-group-membership.ts. */
  "GROUP_STATUS_CONFLICT",
]);
export const productCategory = pgEnum("product_category", [
  "PHYSICAL",
  "DIGITAL",
  "BOOK",
  "SERVICE",
  "OTHER",
  "UNKNOWN",
]);
export const identityConfidence = pgEnum("identity_confidence", ["HIGH", "LOW"]);
export const groupMembershipStatus = pgEnum("group_membership_status", [
  "GROUPED",
  "NOT_GROUPED",
  "UNKNOWN",
]);
export const groupMembershipSource = pgEnum("group_membership_source", [
  "LEGACY_MASUK_WA",
  "LEGACY_BACKUP_MASUK_GRUP",
  "LEGACY_TIDAK_MASUK_WA",
  "CRM_MANUAL",
]);
export const crmTaskType = pgEnum("crm_task_type", [
  "FOLLOW_UP_NEW_CUSTOMER",
  "FOLLOW_UP_REPEAT",
  "BROADCAST",
  "INVITE_GROUP",
  "OTHER",
]);
export const crmTaskStatus = pgEnum("crm_task_status", [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
]);
export const crmTaskOutcome = pgEnum("crm_task_outcome", [
  "NO_RESPONSE",
  "CONTACTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "JOINED_GROUP",
  "CLOSING",
  "FOLLOW_UP_AGAIN",
  "OTHER",
]);
export const crmTransactionStatus = pgEnum("crm_transaction_status", [
  "CONFIRMED",
  "CANCELLED",
  "COD_FAILED",
  "RETURNED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "ADJUSTED",
]);
export const crmHppStatus = pgEnum("crm_hpp_status", ["KNOWN", "UNKNOWN"]);
export const crmReconciliationStatus = pgEnum("crm_reconciliation_status", [
  "PENDING",
  "MATCH_CANDIDATE",
  "RECONCILED",
  "REJECTED",
  "CANCELLED",
]);

/**
 * Workspace CRM V1 (fresh start) — Master Data Produk, Pesanan, dan Biaya
 * Operasional. Tabel `workspace_*` di bawah ini SENGAJA terpisah total dari
 * `orders`/`order_items`/`products` legacy (grain cluster/RFM, DILARANG
 * diubah — lihat CLAUDE.md §ATURAN MUTLAK). Karena tabel ini baru dan hanya
 * pernah diisi sejak implementasi V1, isolasi "data lama tidak masuk
 * Workspace baru" terjamin oleh KONSTRUKSI (tidak ada baris legacy yang
 * pernah/bisa masuk ke sini), bukan oleh filter generation per baris.
 * `workspace_cutover_log` menyimpan jejak audit keputusan fresh-start itu.
 */
export const workspaceProductUsage = pgEnum("workspace_product_usage", [
  "SELLABLE",
  "BONUS_ONLY",
  "SELLABLE_AND_BONUS",
  "INACTIVE",
]);
export const workspaceItemType = pgEnum("workspace_item_type", ["SALE", "BONUS", "SAMPLE"]);
/** RETURNED/REFUNDED/PARTIALLY_REFUNDED dapat dicapai lewat import Database
 *  All (lihat pesanan-import.ts) ATAU manual lewat markOrderReturned/
 *  markOrderRefunded/cancelWorkspaceOrder (server/workspace/pesanan.ts) —
 *  keduanya boleh berangkat dari status apa pun kecuali DRAFT, termasuk
 *  reklasifikasi antar CANCELLED/RETURNED/REFUNDED/PARTIALLY_REFUNDED (fitur
 *  Retur & Refund: pesanan yang sudah dipesan sering perlu dikoreksi antar
 *  ketiganya). Status non-CONFIRMED otomatis TIDAK masuk KPI karena seluruh
 *  query KPI memfilter `status = 'CONFIRMED'` secara eksplisit (bukan
 *  `<> 'CANCELLED'`). */
export const workspaceOrderStatus = pgEnum("workspace_order_status", [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const workspaceUnmappedProductStatus = pgEnum("workspace_unmapped_product_status", ["PENDING", "RESOLVED", "IGNORED"]);
export const workspaceCostCategory = pgEnum("workspace_cost_category", [
  "BROADCAST",
  "MEKARI_QONTAK",
  "WHATSAPP_API",
  "AI_CRM",
  "SOFTWARE_CRM",
  "CAMPAIGN_CRM",
  "DATABASE_LEADS",
  "SAMPLE_PROMOSI",
  "COM_LAINNYA",
]);
export const workspaceCostStatus = pgEnum("workspace_cost_status", [
  "DRAFT",
  "SUBMITTED",
  "LEADER_VERIFIED",
  "SPV_APPROVED",
  "DIRECTOR_APPROVED",
  "REVISION_REQUESTED",
  "REJECTED",
  "CANCELLED",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  /** true untuk akun yang dibuat dengan password sementara (mis. seed bootstrap
   *  awal) — guard di src/server/auth memaksa redirect ke /change-password
   *  sampai user mengganti password sendiri. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /** Audit siapa yang membuat/mengubah akun (halaman Users). Nullable karena
   *  akun yang dibuat lewat `npm run db:seed:admin` tidak punya aktor UI. */
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit trail perubahan akun — append-only, sama pola dengan history lain. */
export const userHistory = pgTable(
  "user_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** CREATE | UPDATE_PROFILE | UPDATE_ROLE | ACTIVATE | DEACTIVATE | RESET_PASSWORD */
    action: text("action").notNull(),
    /** Nilai lama/baru untuk field non-rahasia. Password TIDAK PERNAH dicatat. */
    detail: jsonb("detail").notNull().$type<Record<string, unknown>>().default({}),
    changedBy: integer("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_history_user_idx").on(t.userId, t.changedAt)]
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: serial("id").primaryKey(),
    sourceType: importSourceType("source_type").notNull(),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    status: importStatus("status").notNull().default("UPLOADING"),
    isActive: boolean("is_active").notNull().default(false),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    asOfDate: date("as_of_date"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    excludedRows: integer("excluded_rows").notNull().default(0),
    needsReviewRows: integer("needs_review_rows").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (t) => [
    uniqueIndex("import_batches_source_hash_uq").on(t.sourceType, t.fileHash),
    uniqueIndex("import_batches_one_active_uq")
      .on(t.sourceType)
      .where(sql`${t.isActive} = true`),
    index("import_batches_active_idx").on(t.sourceType, t.isActive),
    check(
      "import_batches_active_completed_ck",
      sql`${t.isActive} = false OR ${t.status} = 'COMPLETED'`
    ),
  ]
);

export const stagingImportRows = pgTable(
  "staging_import_rows",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    rawData: jsonb("raw_data").notNull().$type<Record<string, unknown>>(),
    validationStatus: validationStatus("validation_status"),
    errorCodes: text("error_codes").array().notNull().default([]),
    isCrmTransaction: boolean("is_crm_transaction"),
    crmInclusionReason: text("crm_inclusion_reason"),
    crmExclusionReason: text("crm_exclusion_reason"),
    crmMappingVersion: text("crm_mapping_version"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("staging_rows_batch_row_uq").on(t.importBatchId, t.rowNumber),
    index("staging_rows_status_idx").on(t.importBatchId, t.validationStatus),
  ]
);

export const dataQualityIssues = pgTable(
  "data_quality_issues",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    stagingRowId: bigint("staging_row_id", { mode: "number" }).references(
      () => stagingImportRows.id,
      { onDelete: "cascade" }
    ),
    issueType: issueType("issue_type").notNull(),
    detail: jsonb("detail").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("data_quality_batch_type_idx").on(t.importBatchId, t.issueType)]
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    normalizedPhone: text("normalized_phone").notNull(),
    displayPhone: text("display_phone"),
    name: text("name"),
    /** true bila customer hanya berasal dari DataKSB, belum pernah muncul di Database All. */
    ksbOnly: boolean("ksb_only").notNull().default(false),
    /** Alamat customer — enrichment CRM, tidak pernah diisi dari import transaksi. */
    address: text("address"),
    /** Soft delete operasional: disembunyikan dari list Customers/Group Membership,
     *  TIDAK memengaruhi RFM/Cohort/Frequency/Cluster (tetap dihitung dari seluruh customer). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: integer("archived_by").references(() => users.id),
    firstSeenBatchId: integer("first_seen_batch_id").references(() => importBatches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_phone_uq").on(t.normalizedPhone),
    index("customers_archived_idx").on(t.archivedAt),
  ]
);

export const csAgents = pgTable(
  "cs_agents",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isPerson: boolean("is_person").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("cs_agents_normalized_name_uq").on(t.normalizedName)]
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: productCategory("category").notNull(),
    isProbetes: boolean("is_probetes").notNull(),
    isKsbProduct: boolean("is_ksb_product").notNull().default(false),
    isEbook: boolean("is_ebook").notNull().default(false),
    isBookEntry: boolean("is_book_entry").notNull().default(false),
    isHpOrAmandia: boolean("is_hp_or_amandia").notNull().default(false),
    isTargetPhysical: boolean("is_target_physical").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("products_code_uq").on(t.code)]
);

export const productAliases = pgTable(
  "product_aliases",
  {
    id: serial("id").primaryKey(),
    rawName: text("raw_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: integer("approved_by").references(() => users.id),
    suggestedProductId: integer("suggested_product_id").references(() => products.id),
  },
  (t) => [uniqueIndex("product_aliases_normalized_name_uq").on(t.normalizedName)]
);

/**
 * Order analitik: SATU customer + SATU tanggal = SATU order.
 * Dikonfirmasi dari legacy: Frequency = uniqueDates.size, bukan COUNT(idpesan).
 */
export const orders = pgTable(
  "orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceOrderKey: text("source_order_key").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    orderDate: date("order_date").notNull(),
    orderTotal: bigint("order_total", { mode: "bigint" }).notNull(),
    workspaceTotal: bigint("workspace_total", { mode: "bigint" }).notNull().default(sql`0`),
    platform: text("platform"),
    division: text("division"),
    paymentMethod: text("payment_method"),
    partner: text("partner"),
    csId: integer("cs_id").references(() => csAgents.id),
    memo: text("memo"),
    sourceType: text("source_type").notNull().default("DATABASE_ALL"),
    deterministicFingerprint: text("deterministic_fingerprint"),
    fingerprintVersion: text("fingerprint_version").notNull().default("v1"),
    transactionStatus: crmTransactionStatus("transaction_status").notNull().default("CONFIRMED"),
    isCrmTransaction: boolean("is_crm_transaction").notNull().default(false),
    crmInclusionReason: text("crm_inclusion_reason"),
    crmMappingVersion: text("crm_mapping_version"),
    city: text("city"),
    hub: text("hub"),
    salesType: text("sales_type"),
    shippingCost: bigint("shipping_cost", { mode: "bigint" }).notNull().default(sql`0`),
    packingCost: bigint("packing_cost", { mode: "bigint" }).notNull().default(sql`0`),
    discount: bigint("discount", { mode: "bigint" }).notNull().default(sql`0`),
    adminCod: bigint("admin_cod", { mode: "bigint" }).notNull().default(sql`0`),
    crmVoucher: bigint("crm_voucher", { mode: "bigint" }).notNull().default(sql`0`),
    codValue: bigint("cod_value", { mode: "bigint" }).notNull().default(sql`0`),
    crmMarketingCost: bigint("crm_marketing_cost", { mode: "bigint" }).notNull().default(sql`0`),
    orderClosingCount: integer("order_closing_count").notNull().default(1),
    sourceBatchId: integer("source_batch_id")
      .notNull()
      .references(() => importBatches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_source_key_uq").on(t.sourceOrderKey),
    uniqueIndex("orders_fingerprint_uq").on(t.deterministicFingerprint),
    index("orders_customer_date_idx").on(t.customerId, t.orderDate),
    index("orders_workspace_date_idx").on(t.isCrmTransaction, t.orderDate),
    index("orders_status_idx").on(t.transactionStatus),
    index("orders_cs_idx").on(t.csId),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceItemKey: text("source_item_key").notNull(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    rawProductName: text("raw_product_name").notNull(),
    externalId: text("external_id"),
    qty: numeric("qty"),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    isBonus: boolean("is_bonus").notNull().default(false),
    identityConfidence: identityConfidence("identity_confidence").notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    sellingPrice: bigint("selling_price", { mode: "bigint" }).notNull().default(sql`0`),
    grossItemValue: bigint("gross_item_value", { mode: "bigint" }).notNull().default(sql`0`),
    unitHppSnapshot: bigint("unit_hpp_snapshot", { mode: "bigint" }),
    totalHpp: bigint("total_hpp", { mode: "bigint" }),
    hppStatus: crmHppStatus("hpp_status").notNull().default("UNKNOWN"),
    allocationSequence: integer("allocation_sequence").notNull().default(0),
    allocatedDiscount: bigint("allocated_discount", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedPacking: bigint("allocated_packing", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedAdminCod: bigint("allocated_admin_cod", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedVoucher: bigint("allocated_voucher", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedCom: bigint("allocated_com", { mode: "bigint" }).notNull().default(sql`0`),
    netItemRevenue: bigint("net_item_revenue", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    uniqueIndex("order_items_source_key_uq").on(t.sourceItemKey),
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
  ]
);

/** Dataset KSB terpisah; hanya dipakai untuk Cluster B, bukan RFM/Cohort Probetes. */
export const ksbTransactions = pgTable(
  "ksb_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceTransactionKey: text("source_transaction_key").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerId: integer("customer_id").references(() => customers.id),
    transactionDate: date("transaction_date").notNull(),
    productName: text("product_name").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    sourceBatchId: integer("source_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [
    uniqueIndex("ksb_transactions_source_key_uq").on(t.sourceTransactionKey),
    index("ksb_transactions_phone_date_idx").on(t.customerPhone, t.transactionDate),
    index("ksb_transactions_customer_idx").on(t.customerId),
  ]
);

/**
 * Status membership grup SAAT INI — satu baris per customer (bukan multi-grup).
 *
 * TIDAK ADA BARIS = efektif NOT_GROUPED saat evaluasi cluster, BUKAN UNKNOWN.
 * Dasarnya keputusan Q1 (docs/07-OPEN-QUESTIONS.md): `has_group = phone ∈
 * (masukWA ∪ BackupMasukGrup)` — di luar daftar itu berarti belum masuk grup.
 * Karena itu rebuildClusters memakai COALESCE(gm.status, 'NOT_GROUPED').
 *
 * Nilai UNKNOWN yang tersimpan EKSPLISIT hanya untuk konflik sumber (nomor
 * muncul di daftar positif dan negatif sekaligus, issue GROUP_STATUS_CONFLICT);
 * itulah satu-satunya yang memicu NEEDS_REVIEW lewat features.ts.
 */
export const customerGroupMemberships = pgTable(
  "customer_group_memberships",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: groupMembershipStatus("status").notNull().default("UNKNOWN"),
    groupName: text("group_name"),
    joinedAt: date("joined_at"),
    picUserId: integer("pic_user_id").references(() => users.id),
    notes: text("notes"),
    source: groupMembershipSource("source").notNull(),
    sourceBatchId: integer("source_batch_id").references(() => importBatches.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id),
  },
  (t) => [uniqueIndex("customer_group_memberships_customer_uq").on(t.customerId)]
);

/** Audit trail perubahan status membership — append-only. */
export const customerGroupMembershipHistory = pgTable(
  "customer_group_membership_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    oldStatus: groupMembershipStatus("old_status"),
    newStatus: groupMembershipStatus("new_status").notNull(),
    source: groupMembershipSource("source").notNull(),
    changedBy: integer("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_group_membership_history_customer_idx").on(t.customerId, t.changedAt)]
);

/**
 * Audit trail koreksi data profil customer (nama/alamat/No HP) oleh CRM/Admin —
 * append-only, satu baris per field yang berubah dalam satu penyimpanan. Ini
 * BUKAN edit "raw data" (staging_import_rows tidak pernah disentuh) — ini
 * koreksi di layer canonical untuk data yang salah input, dengan jejak audit
 * siapa/kapan/apa, sama pola dengan customer_group_membership_history.
 */
export const productHppHistory = pgTable(
  "product_hpp_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id),
    unitHpp: bigint("unit_hpp", { mode: "bigint" }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_hpp_product_date_idx").on(t.productId, t.effectiveFrom),
    check("product_hpp_nonnegative_ck", sql`${t.unitHpp} >= 0`),
    check("product_hpp_range_ck", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`),
  ]
);

export const customerProfileHistory = pgTable(
  "customer_profile_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    field: text("field").notNull().$type<"name" | "address" | "phone">(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: integer("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_profile_history_customer_idx").on(t.customerId, t.changedAt)]
);

export interface ClusterReason {
  matchedRule: ClusterAssignmentCode;
  priority: number | null;
  checks: Array<{
    label: string;
    passed: boolean;
    actual: string | number | boolean | null;
  }>;
}

export const customerRfmCurrent = pgTable(
  "customer_rfm_current",
  {
    customerId: integer("customer_id")
      .primaryKey()
      .references(() => customers.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date").notNull(),
    recencyDays: integer("recency_days"),
    frequency: integer("frequency").notNull(),
    monetary: bigint("monetary", { mode: "bigint" }).notNull(),
    firstOrderDate: date("first_order_date"),
    lastOrderDate: date("last_order_date"),
    avgOrderValue: bigint("avg_order_value", { mode: "bigint" }),
    customerAgeDays: integer("customer_age_days"),
    yaconaFrequency: integer("yacona_frequency").notNull().default(0),
    cohortMonth: date("cohort_month"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_rfm_cohort_idx").on(t.cohortMonth)]
);

export const customerClusterCurrent = pgTable(
  "customer_cluster_current",
  {
    customerId: integer("customer_id")
      .primaryKey()
      .references(() => customers.id, { onDelete: "cascade" }),
    clusterCode: text("cluster_code").notNull().$type<ClusterAssignmentCode>(),
    ruleVersion: text("rule_version").notNull(),
    reason: jsonb("reason").notNull().$type<ClusterReason>(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_cluster_current_code_idx").on(t.clusterCode)]
);

export const customerClusterHistory = pgTable(
  "customer_cluster_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    clusterCode: text("cluster_code").notNull().$type<ClusterAssignmentCode>(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    ruleVersion: text("rule_version").notNull(),
    reason: jsonb("reason").notNull().$type<ClusterReason>(),
    batchId: integer("batch_id").references(() => importBatches.id),
  },
  (t) => [
    index("customer_cluster_history_customer_idx").on(t.customerId, t.validFrom),
    uniqueIndex("customer_cluster_history_open_uq")
      .on(t.customerId)
      .where(sql`${t.validTo} IS NULL`),
  ]
);

export const clusterRules = pgTable(
  "cluster_rules",
  {
    id: serial("id").primaryKey(),
    clusterCode: text("cluster_code").notNull(),
    version: text("version").notNull(),
    priority: integer("priority").notNull(),
    ruleDefinition: jsonb("rule_definition").notNull().$type<Record<string, unknown>>(),
    description: text("description").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("cluster_rules_code_version_uq").on(t.clusterCode, t.version)]
);

/**
 * CRM Report — laporan closing manual CRM, terpisah total dari `orders` kanonik
 * (bukan sumber RFM/Cohort/Cluster). `customer_id` best-effort match by phone,
 * nullable karena laporan tetap harus bisa disimpan walau nomor belum/tidak ada
 * di Database All. Soft delete lewat `archived_at` (arsip, bukan DELETE fisik —
 * konsisten dengan pola archive di `customers`).
 */
export const crmReports = pgTable(
  "crm_reports",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    normalizedPhone: text("normalized_phone"),
    address: text("address"),
    expedition: text("expedition"),
    memo: text("memo"),
    paymentMethod: text("payment_method"),
    shippingCost: bigint("shipping_cost", { mode: "bigint" }).notNull().default(sql`0`),
    packingCost: bigint("packing_cost", { mode: "bigint" }).notNull().default(sql`0`),
    discount: bigint("discount", { mode: "bigint" }).notNull().default(sql`0`),
    adminCod: bigint("admin_cod", { mode: "bigint" }).notNull().default(sql`0`),
    totalPayment: bigint("total_payment", { mode: "bigint" }).notNull().default(sql`0`),
    csName: text("cs_name"),
    advName: text("adv_name"),
    note: text("note"),
    hub: text("hub"),
    city: text("city"),
    reportDate: date("report_date").notNull(),
    orderClosingCount: integer("order_closing_count"),
    salesType: text("sales_type"),
    platform: text("platform"),
    division: text("division"),
    dataReceivedCount: integer("data_received_count"),
    crmVoucher: text("crm_voucher"),
    codValue: bigint("cod_value", { mode: "bigint" }).notNull().default(sql`0`),
    recipientDistrict: text("recipient_district"),
    recipientPostalCode: text("recipient_postal_code"),
    partner: text("partner"),
    crmMarketingCost: bigint("crm_marketing_cost", { mode: "bigint" }).notNull().default(sql`0`),
    /** Diisi opsional saat CRM menautkan laporan ini ke tugas Workspace yang
     *  memicunya (mis. outcome CLOSING) — murni provenance, laporan tetap berdiri
     *  sendiri (bisa null) dan tetap BUKAN sumber canonical order. */
    taskId: integer("task_id").references(() => crmTasks.id),
    sourceType: text("source_type").notNull().default("CRM_MANUAL"),
    reconciliationStatus: crmReconciliationStatus("reconciliation_status").notNull().default("PENDING"),
    transactionStatus: crmTransactionStatus("transaction_status").notNull().default("CONFIRMED"),
    deterministicFingerprint: text("deterministic_fingerprint"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: integer("cancelled_by").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_reports_date_idx").on(t.reportDate),
    index("crm_reports_customer_idx").on(t.customerId),
    index("crm_reports_archived_idx").on(t.archivedAt),
    uniqueIndex("crm_reports_task_uq").on(t.taskId),
  ]
);

/** Baris produk per laporan — maksimal 5 di UI, relational (bukan product1..product5). */
export const crmReportItems = pgTable(
  "crm_report_items",
  {
    id: serial("id").primaryKey(),
    crmReportId: integer("crm_report_id")
      .notNull()
      .references(() => crmReports.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    productName: text("product_name").notNull(),
    qty: numeric("qty").notNull().default("1"),
    productValue: bigint("product_value", { mode: "bigint" }).notNull().default(sql`0`),
    /** Catatan bebas per baris produk (mis. varian/warna/ukuran) — opsional, tidak memengaruhi kalkulasi Total Bayar. */
    itemNote: text("item_note"),
    productId: integer("product_id").references(() => products.id),
    unitHppSnapshot: bigint("unit_hpp_snapshot", { mode: "bigint" }),
    totalHpp: bigint("total_hpp", { mode: "bigint" }),
    hppStatus: crmHppStatus("hpp_status").notNull().default("UNKNOWN"),
    allocationSequence: integer("allocation_sequence").notNull().default(0),
    allocatedDiscount: bigint("allocated_discount", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedPacking: bigint("allocated_packing", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedAdminCod: bigint("allocated_admin_cod", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedVoucher: bigint("allocated_voucher", { mode: "bigint" }).notNull().default(sql`0`),
    allocatedCom: bigint("allocated_com", { mode: "bigint" }).notNull().default(sql`0`),
    netItemRevenue: bigint("net_item_revenue", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    index("crm_report_items_report_idx").on(t.crmReportId),
    uniqueIndex("crm_report_items_report_line_uq").on(t.crmReportId, t.lineNo),
  ]
);

/**
 * Workspace — antrean kerja operasional CRM. TERPISAH dari canonical
 * transaksi (orders/order_items): task hanya mengarahkan pekerjaan CRM,
 * tidak pernah jadi sumber RFM/Cohort/Cluster. Satu row = satu pekerjaan
 * atas satu customer (customer boleh punya banyak task sepanjang waktu,
 * kecuali FOLLOW_UP_NEW_CUSTOMER yang dibatasi satu per customer — lihat
 * crm_tasks_new_customer_uq, itulah yang menjamin re-import file yang sama
 * tidak pernah membuat task customer-baru ganda).
 */
export const crmLeadBatches = pgTable(
  "crm_lead_batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    sourceBatchId: text("source_batch_id"),
    reportReference: text("report_reference"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    leadsReceived: integer("leads_received").notNull(),
    attributedUserId: integer("attributed_user_id").references(() => users.id),
    attributedProductId: integer("attributed_product_id").references(() => products.id),
    attributedSalesType: text("attributed_sales_type"),
    attributedHub: text("attributed_hub"),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    official: boolean("official").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_lead_batches_source_batch_uq").on(t.source, t.sourceBatchId).where(sql`${t.sourceBatchId} IS NOT NULL`),
    uniqueIndex("crm_lead_batches_report_ref_uq").on(t.source, t.reportReference).where(sql`${t.sourceBatchId} IS NULL AND ${t.reportReference} IS NOT NULL`),
    index("crm_lead_batches_period_idx").on(t.periodStart, t.periodEnd),
    check("crm_lead_batches_identity_ck", sql`${t.sourceBatchId} IS NOT NULL OR ${t.reportReference} IS NOT NULL`),
    check("crm_lead_batches_period_ck", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("crm_lead_batches_count_ck", sql`${t.leadsReceived} >= 0`),
  ]
);

export const crmOrderAdjustments = pgTable(
  "crm_order_adjustments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id),
    source: text("source").notNull(),
    sourceAdjustmentId: text("source_adjustment_id"),
    deterministicFingerprint: text("deterministic_fingerprint"),
    adjustmentType: text("adjustment_type").notNull(),
    effectiveDate: date("effective_date").notNull(),
    closingDelta: integer("closing_delta").notNull().default(0),
    revenueDelta: bigint("revenue_delta", { mode: "bigint" }).notNull().default(sql`0`),
    quantityDelta: numeric("quantity_delta").notNull().default("0"),
    cosDelta: bigint("cos_delta", { mode: "bigint" }).notNull().default(sql`0`),
    comDelta: bigint("com_delta", { mode: "bigint" }).notNull().default(sql`0`),
    reason: text("reason").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_adjustments_source_id_uq").on(t.source, t.sourceAdjustmentId).where(sql`${t.sourceAdjustmentId} IS NOT NULL`),
    uniqueIndex("crm_adjustments_fingerprint_uq").on(t.deterministicFingerprint).where(sql`${t.sourceAdjustmentId} IS NULL AND ${t.deterministicFingerprint} IS NOT NULL`),
    index("crm_adjustments_order_date_idx").on(t.orderId, t.effectiveDate),
    check("crm_adjustments_identity_ck", sql`${t.sourceAdjustmentId} IS NOT NULL OR ${t.deterministicFingerprint} IS NOT NULL`),
  ]
);

export const crmReconciliations = pgTable(
  "crm_reconciliations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    manualReportId: integer("manual_report_id").notNull().references(() => crmReports.id),
    officialOrderId: bigint("official_order_id", { mode: "number" }).notNull().references(() => orders.id),
    status: crmReconciliationStatus("status").notNull().default("MATCH_CANDIDATE"),
    matchMethod: text("match_method").notNull(),
    matchReason: jsonb("match_reason").notNull().$type<Record<string, unknown>>().default({}),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_reconciliations_pair_uq").on(t.manualReportId, t.officialOrderId),
    uniqueIndex("crm_reconciliations_manual_reconciled_uq").on(t.manualReportId).where(sql`${t.status} = 'RECONCILED'`),
    uniqueIndex("crm_reconciliations_official_reconciled_uq").on(t.officialOrderId).where(sql`${t.status} = 'RECONCILED'`),
    index("crm_reconciliations_status_idx").on(t.status),
  ]
);

export const crmAuditLogs = pgTable(
  "crm_audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeValue: jsonb("before_value").$type<Record<string, unknown> | null>(),
    afterValue: jsonb("after_value").$type<Record<string, unknown> | null>(),
    reason: text("reason"),
    requestReferenceId: text("request_reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_audit_entity_idx").on(t.entityType, t.entityId, t.createdAt)]
);

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    taskType: crmTaskType("task_type").notNull(),
    status: crmTaskStatus("status").notNull().default("UNASSIGNED"),
    assignedTo: integer("assigned_to").references(() => users.id),
    assignedBy: integer("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    dueAt: date("due_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: integer("completed_by").references(() => users.id),
    outcome: crmTaskOutcome("outcome"),
    notes: text("notes"),
    officialOrderId: bigint("official_order_id", { mode: "number" }).references(() => orders.id),
    /** Link opsional ke Pesanan Workspace V1 (fresh start) saat outcome CLOSING
     *  suatu task dibuatkan/dihubungkan ke pesanan baru. Terpisah dari
     *  `officialOrderId` (yang menunjuk `orders` legacy) karena `workspace_orders`
     *  adalah tabel baru — lihat komentar di definisinya. */
    workspaceOrderId: bigint("workspace_order_id", { mode: "number" }).references(() => workspaceOrders.id),
    firstActivityAt: timestamp("first_activity_at", { withTimezone: true }),
    /** Batch Database All yang memicu deteksi customer baru — null untuk task
     *  yang dibuat manual (FOLLOW_UP_REPEAT/BROADCAST/INVITE_GROUP/OTHER). */
    detectedFromBatchId: integer("detected_from_batch_id").references(() => importBatches.id),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    deletedFromStatus: crmTaskStatus("deleted_from_status"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_tasks_status_idx").on(t.status),
    index("crm_tasks_assigned_to_idx").on(t.assignedTo),
    index("crm_tasks_customer_idx").on(t.customerId),
    index("crm_tasks_due_at_idx").on(t.dueAt),
    index("crm_tasks_created_at_idx").on(t.createdAt),
    index("crm_tasks_type_idx").on(t.taskType),
    index("crm_tasks_deleted_at_idx").on(t.deletedAt),
    uniqueIndex("crm_tasks_new_customer_uq")
      .on(t.customerId)
      .where(sql`${t.taskType} = 'FOLLOW_UP_NEW_CUSTOMER'`),
  ]
);

/** Audit trail transisi status/assignment — append-only, sama pola dengan
 *  customer_group_membership_history. */
export const crmTaskActivities = pgTable(
  "crm_task_activities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: bigint("task_id", { mode: "number" }).notNull().references(() => crmTasks.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    detail: jsonb("detail").notNull().$type<Record<string, unknown>>().default({}),
    actorUserId: integer("actor_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_activities_task_idx").on(t.taskId, t.createdAt)]
);

export const crmTaskHistory = pgTable(
  "crm_task_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    fromStatus: crmTaskStatus("from_status"),
    toStatus: crmTaskStatus("to_status").notNull(),
    note: text("note"),
    changedBy: integer("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_history_task_idx").on(t.taskId, t.changedAt)]
);

/**
 * ============================================================================
 * WORKSPACE CRM V1 — Master Data Produk, Pesanan, Biaya Operasional (COM).
 * Fresh start: tabel-tabel di bawah ini TIDAK PERNAH diisi dari data lama.
 * Lihat docs/09-WORKSPACE-CRM-CONTRACT.md untuk kontrak layer sebelumnya
 * (crm_reports/orders/is_crm_transaction) — layer itu tetap ada (tidak
 * dihapus) tapi tidak lagi jadi sumber menu Overview/Pesanan Workspace.
 * ============================================================================
 */

export const workspacePaymentMethod = pgEnum("workspace_payment_method", ["COD", "TRANSFER"]);

/** Master Data — Product Master Workspace. `productId` (mis. PRO-0001) adalah
 *  business key stabil dipakai lintas modul (Pesanan, import mapping),
 *  terpisah dari `products.code` legacy (dipakai cluster engine). */
export const workspaceProducts = pgTable(
  "workspace_products",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    sellingPrice: bigint("selling_price", { mode: "bigint" }),
    unitHpp: bigint("unit_hpp", { mode: "bigint" }).notNull(),
    productUsage: workspaceProductUsage("product_usage").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_products_product_id_uq").on(t.productId),
    index("workspace_products_usage_idx").on(t.productUsage),
    index("workspace_products_active_idx").on(t.isActive),
    check("workspace_products_selling_price_ck", sql`${t.sellingPrice} IS NULL OR ${t.sellingPrice} >= 0`),
    check("workspace_products_hpp_ck", sql`${t.unitHpp} >= 0`),
    check(
      "workspace_products_sellable_price_ck",
      sql`${t.productUsage} NOT IN ('SELLABLE','SELLABLE_AND_BONUS') OR ${t.sellingPrice} IS NOT NULL`
    ),
  ]
);

/** Mapping nama mentah (mis. dari Database All) -> product_id Master Data.
 *  Alias baru wajib di-approve admin (ATURAN MUTLAK #10) — tidak ada
 *  auto-mapping diam-diam, sama pola dengan `product_aliases` legacy. */
export const workspaceProductAliases = pgTable(
  "workspace_product_aliases",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => workspaceProducts.id),
    sourceSystem: text("source_system").notNull().default("DATABASE_ALL"),
    aliasName: text("alias_name").notNull(),
    aliasNormalized: text("alias_normalized").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_product_aliases_normalized_uq").on(t.aliasNormalized)]
);

/**
 * Pesanan Workspace — order header. Satu tabel untuk pesanan MANUAL (input
 * CRM) maupun DATABASE_ALL (import) — dibedakan `sourceType`, dedup memakai
 * `sourceOrderId` (prioritas 1) atau `deterministicFingerprint` (fallback),
 * lihat docs prompt §10. Karena satu tabel, "manual yang match hasil import"
 * ditangani dengan MENGONVERSI baris manual jadi baris official (bukan insert
 * baris kedua) — lihat `server/workspace/pesanan.ts` — sehingga hanya satu
 * transaksi pernah masuk KPI, by construction (unique index), bukan lewat
 * reconciliation table terpisah.
 */
export const workspaceOrders = pgTable(
  "workspace_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderNumber: text("order_number").notNull(),
    sourceType: text("source_type").notNull().default("MANUAL"),
    sourceOrderId: text("source_order_id"),
    deterministicFingerprint: text("deterministic_fingerprint"),
    /** Fingerprint isi transaksi TANPA source — dipakai mencocokkan pesanan
     *  MANUAL dengan hasil import DATABASE_ALL yang sama (docs prompt §10:
     *  "jangan membuat double count... official/import menjadi sumber utama").
     *  Beda dari `deterministicFingerprint` (yang menyertakan source, untuk
     *  unique index anti-duplikat re-import). */
    matchFingerprint: text("match_fingerprint"),
    /** Selalu 'CRM_FRESH_V1' — tabel ini secara struktural tidak pernah diisi
     *  data lama (lihat komentar blok di atas), kolom ini murni untuk audit/
     *  verifikasi eksplisit yang dapat di-query langsung. */
    workspaceGeneration: text("workspace_generation").notNull().default("CRM_FRESH_V1"),
    orderDate: date("order_date").notNull(),
    /** Best-effort match by phone ke `customers` (registry identitas lintas
     *  modul) — nullable karena lead CRM baru belum tentu pernah muncul di
     *  Database All. Bukan sumber data pesanan; `customerName`/`normalizedPhone`
     *  di bawah tetap snapshot mandiri, sama pola dengan crm_reports.customerId. */
    customerId: integer("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    normalizedPhone: text("normalized_phone").notNull(),
    phoneDisplay: text("phone_display"),
    address: text("address"),
    city: text("city"),
    district: text("district"),
    postalCode: text("postal_code"),
    expedition: text("expedition"),
    hub: text("hub"),
    paymentMethod: workspacePaymentMethod("payment_method").notNull(),
    memo: text("memo"),
    partner: text("partner"),
    crmUserId: integer("crm_user_id").references(() => users.id),
    crmNameSnapshot: text("crm_name_snapshot").notNull(),
    salesType: text("sales_type"),
    salesSource: text("sales_source"),
    shippingCharge: bigint("shipping_charge", { mode: "bigint" }).notNull().default(sql`0`),
    packingCharge: bigint("packing_charge", { mode: "bigint" }).notNull().default(sql`0`),
    discount: bigint("discount", { mode: "bigint" }).notNull().default(sql`0`),
    codAdmin: bigint("cod_admin", { mode: "bigint" }).notNull().default(sql`0`),
    crmVoucher: bigint("crm_voucher", { mode: "bigint" }).notNull().default(sql`0`),
    totalSalesValue: bigint("total_sales_value", { mode: "bigint" }).notNull().default(sql`0`),
    orderTotal: bigint("order_total", { mode: "bigint" }).notNull().default(sql`0`),
    codValue: bigint("cod_value", { mode: "bigint" }).notNull().default(sql`0`),
    status: workspaceOrderStatus("status").notNull().default("DRAFT"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: integer("confirmed_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: integer("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    /** Jejak audit "Tandai Retur" manual (fitur AOV/Retur & Refund) — hanya
     *  diisi lewat markOrderReturned() di server/workspace/pesanan.ts, selalu
     *  dari status CONFIRMED. Retur hasil import Database All TIDAK mengisi
     *  kolom ini (langsung status RETURNED tanpa aktor CRM). */
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedBy: integer("returned_by").references(() => users.id),
    returnReason: text("return_reason"),
    /** Jejak audit "Tandai Refund" manual — sama seperti retur di atas.
     *  `refundAmount` WAJIB terisi untuk PARTIALLY_REFUNDED (nilai refund
     *  yang valid, bukan ditebak) dan diisi = order_total untuk REFUNDED penuh. */
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedBy: integer("refunded_by").references(() => users.id),
    refundReason: text("refund_reason"),
    refundAmount: bigint("refund_amount", { mode: "bigint" }),
    /** Soft delete (fitur checkbox/klik-kanan Pesanan) — SATU-SATUNYA jalur
     *  "hapus" untuk workspace_orders, sengaja BUKAN SQL DELETE: baris + jejak
     *  audit tetap ada (bisa ditelusuri/dipulihkan lewat DB langsung), konsisten
     *  dengan pola "Hapus" di Pembagian Tugas. Setiap query baca workspace_orders
     *  WAJIB memfilter deletedAt IS NULL lewat notDeletedCondition() (lihat
     *  server/workspace/generation.ts) — sama seperti activeGenerationCondition(),
     *  supaya tidak ada jalur yang lupa memfilternya. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by").references(() => users.id),
    deleteReason: text("delete_reason"),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    createdBy: integer("created_by").references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_orders_order_number_uq").on(t.orderNumber),
    /**
     * `workspace_generation` ditambahkan ke ketiga unique constraint identitas
     * (audit performa/QA — BUG-12): tanpa ini, source_order_id/fingerprint yang
     * SAMA pada angkatan (generation) BERBEDA akan saling bentrok sebagai
     * "duplikat" padahal keduanya sengaja diizinkan berdampingan (angkatan baru
     * TIDAK mewarisi data angkatan lama, tapi bisa saja meng-import ulang
     * source_order_id yang pernah dipakai angkatan sebelumnya). Duplikat DALAM
     * satu generation yang sama tetap ditolak seperti sebelumnya — constraint
     * hanya diperlebar (generation ditambahkan sebagai kolom PERTAMA composite
     * key), bukan dilonggarkan.
     */
    uniqueIndex("workspace_orders_source_id_uq")
      .on(t.workspaceGeneration, t.sourceType, t.sourceOrderId)
      .where(sql`${t.sourceOrderId} IS NOT NULL`),
    uniqueIndex("workspace_orders_fingerprint_uq")
      .on(t.workspaceGeneration, t.deterministicFingerprint)
      .where(sql`${t.deterministicFingerprint} IS NOT NULL`),
    /**
     * Sebelumnya index BIASA (bukan unique) — match_fingerprint dipakai untuk
     * mencocokkan pesanan MANUAL dengan hasil import (§10 "official menjadi
     * sumber utama"), dan kode pemanggil sudah memakai `LIMIT 1` sehingga
     * secara fungsional TIDAK PERNAH bergantung pada keunikan. Diperketat jadi
     * UNIQUE (per generation) di sini karena audit tidak menemukan duplikat
     * apa pun pada data live (0 baris match_fingerprint terisi saat diaudit) —
     * memperketat sekarang mencegah duplikat diam-diam di masa depan tanpa
     * risiko terhadap data yang sudah ada.
     */
    uniqueIndex("workspace_orders_match_fingerprint_uq")
      .on(t.workspaceGeneration, t.matchFingerprint)
      .where(sql`${t.matchFingerprint} IS NOT NULL`),
    index("workspace_orders_date_idx").on(t.orderDate),
    index("workspace_orders_status_idx").on(t.status),
    index("workspace_orders_crm_user_idx").on(t.crmUserId),
    index("workspace_orders_phone_idx").on(t.normalizedPhone),
    index("workspace_orders_generation_idx").on(t.workspaceGeneration),
    check("workspace_orders_total_ck", sql`${t.orderTotal} >= 0`),
    check("workspace_orders_refund_amount_ck", sql`${t.refundAmount} IS NULL OR (${t.refundAmount} >= 0 AND ${t.refundAmount} <= ${t.orderTotal})`),
    /**
     * Pesanan tanpa No Order/ID Pesanan Everpro (source_order_id) TIDAK BOLEH
     * berstatus selain DRAFT — aturan bisnis eksplisit (fitur tracking Everpro):
     * status apa pun selain DRAFT berarti "sudah trackable", jadi wajib punya
     * nomor itu. Ditegakkan di level APLIKASI (confirmWorkspaceOrder,
     * cancelWorkspaceOrder, updateWorkspaceOrder) DAN di level DATABASE lewat
     * CHECK ini — supaya tidak ada jalur mana pun (bug, import, query manual)
     * yang bisa diam-diam melanggarnya lagi seperti yang sempat terjadi pada
     * data lama (baris CONFIRMED/CANCELLED tanpa source_order_id).
     */
    check("workspace_orders_status_requires_source_order_id_ck", sql`${t.status} = 'DRAFT' OR ${t.sourceOrderId} IS NOT NULL`),
  ]
);

export const workspaceOrderItems = pgTable(
  "workspace_order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => workspaceOrders.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => workspaceProducts.id),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    itemType: workspaceItemType("item_type").notNull(),
    quantity: numeric("quantity").notNull(),
    sellingPriceSnapshot: bigint("selling_price_snapshot", { mode: "bigint" }).notNull().default(sql`0`),
    unitHppSnapshot: bigint("unit_hpp_snapshot", { mode: "bigint" }).notNull().default(sql`0`),
    totalSalesValue: bigint("total_sales_value", { mode: "bigint" }).notNull().default(sql`0`),
    totalHpp: bigint("total_hpp", { mode: "bigint" }).notNull().default(sql`0`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_order_items_order_line_uq").on(t.orderId, t.lineNo),
    index("workspace_order_items_order_idx").on(t.orderId),
    index("workspace_order_items_product_idx").on(t.productId),
    check("workspace_order_items_qty_ck", sql`${t.quantity} > 0`),
  ]
);

/**
 * Biaya Operasional CRM (COM) — hanya `DIRECTOR_APPROVED` yang masuk COM
 * Overview/Pesanan. Approval chain named-role (Leader/SPV/Director) diperiksa
 * via nama user aktif, lihat `src/lib/workspace-cost-workflow.ts`.
 */
export const workspaceOperationalCosts = pgTable(
  "workspace_operational_costs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    costDate: date("cost_date").notNull(),
    costName: text("cost_name").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    category: workspaceCostCategory("category").notNull(),
    vendor: text("vendor"),
    usagePeriod: text("usage_period"),
    paymentMethod: text("payment_method"),
    referenceNumber: text("reference_number"),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    status: workspaceCostStatus("status").notNull().default("DRAFT"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    leaderVerifiedBy: integer("leader_verified_by").references(() => users.id),
    leaderVerifiedAt: timestamp("leader_verified_at", { withTimezone: true }),
    spvApprovedBy: integer("spv_approved_by").references(() => users.id),
    spvApprovedAt: timestamp("spv_approved_at", { withTimezone: true }),
    directorApprovedBy: integer("director_approved_by").references(() => users.id),
    directorApprovedAt: timestamp("director_approved_at", { withTimezone: true }),
    revisionReason: text("revision_reason"),
    rejectReason: text("reject_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: integer("cancelled_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("workspace_costs_date_idx").on(t.costDate),
    index("workspace_costs_status_idx").on(t.status),
    index("workspace_costs_category_idx").on(t.category),
    check("workspace_costs_amount_ck", sql`${t.amount} > 0`),
  ]
);

/**
 * Data Quality Workspace — nama produk dari import yang tidak cocok alias
 * `workspace_product_aliases` manapun. Terpisah dari `data_quality_issues`
 * legacy (mapping berbeda, katalog berbeda) — order yang punya baris di sini
 * SENGAJA tidak dimasukkan ke `workspace_orders` sampai admin approve alias
 * (docs prompt §5.4: "jangan masukkan order yang belum valid ke KPI sampai
 * mapping selesai").
 */
/**
 * Satu baris per NAMA produk unik yang belum punya alias Master Data — alias
 * yang di-approve admin menyelesaikan SELURUH order yang pernah kena nama ini
 * sekaligus (retry lewat re-import), karena itu grain-nya per nama, bukan per
 * order. `sample*`/`rawPayload` menyimpan CONTOH kejadian PALING BARU untuk
 * konteks admin — bukan daftar lengkap semua order yang terdampak.
 */
export const workspaceUnmappedProducts = pgTable(
  "workspace_unmapped_products",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull().default("DATABASE_ALL"),
    rawProductName: text("raw_product_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    sampleSourceOrderId: text("sample_source_order_id"),
    sampleCustomerName: text("sample_customer_name"),
    sampleOrderDate: date("sample_order_date"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    status: workspaceUnmappedProductStatus("status").notNull().default("PENDING"),
    mappedProductId: integer("mapped_product_id").references(() => workspaceProducts.id),
    resolvedBy: integer("resolved_by").references(() => users.id),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workspace_unmapped_products_normalized_uq").on(t.normalizedName),
    index("workspace_unmapped_products_batch_idx").on(t.importBatchId),
    index("workspace_unmapped_products_status_idx").on(t.status),
  ]
);

/** Audit fresh-start cutover (§2 prompt) — kapan Workspace mulai dipakai,
 *  siapa yang memutuskan, alasan, dan berapa banyak data lama yang secara
 *  eksplisit dikeluarkan dari cakupan Workspace baru. Satu baris per keputusan
 *  cutover (biasanya satu-satunya baris); baris terbaru = cutover aktif. */
export const workspaceCutoverLog = pgTable("workspace_cutover_log", {
  id: serial("id").primaryKey(),
  cutoverAt: timestamp("cutover_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  reason: text("reason").notNull(),
  legacyExcludedCount: integer("legacy_excluded_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
