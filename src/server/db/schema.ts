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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    platform: text("platform"),
    division: text("division"),
    paymentMethod: text("payment_method"),
    partner: text("partner"),
    csId: integer("cs_id").references(() => csAgents.id),
    memo: text("memo"),
    sourceBatchId: integer("source_batch_id")
      .notNull()
      .references(() => importBatches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_source_key_uq").on(t.sourceOrderKey),
    index("orders_customer_date_idx").on(t.customerId, t.orderDate),
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
 * Tidak ada baris = UNKNOWN (customer tidak pernah muncul di source manapun);
 * lihat docs/02-CLUSTER-RULES.md untuk pemakaian di cluster engine (has_group).
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
    index("crm_reports_task_idx").on(t.taskId),
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
    /** Batch Database All yang memicu deteksi customer baru — null untuk task
     *  yang dibuat manual (FOLLOW_UP_REPEAT/BROADCAST/INVITE_GROUP/OTHER). */
    detectedFromBatchId: integer("detected_from_batch_id").references(() => importBatches.id),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
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
    uniqueIndex("crm_tasks_new_customer_uq")
      .on(t.customerId)
      .where(sql`${t.taskType} = 'FOLLOW_UP_NEW_CUSTOMER'`),
  ]
);

/** Audit trail transisi status/assignment — append-only, sama pola dengan
 *  customer_group_membership_history. */
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
