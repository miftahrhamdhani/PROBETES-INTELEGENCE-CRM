/**
 * BACKEND — laporan Reconciliation (PRD §8).
 *
 * Tujuan: MENJELASKAN selisih, bukan menebaknya. Karena itu tiap angka dibaca
 * langsung dari tabel canonical/import dan diberi label universe (baris / order /
 * item / customer / transaksi / membership) supaya tidak pernah tercampur.
 *
 * Semua angka dihitung dari DB — tidak ada konstanta hasil audit yang di-hardcode.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getDatasetContext } from "./dataset";
import type { ReconciliationReport, ReconciliationSection } from "@/lib/reconciliation-types";

type Counts = Record<string, number>;

export async function getReconciliationReport(): Promise<ReconciliationReport> {
  const db = getDb();
  const ctx = await getDatasetContext();

  const result = await db.execute<Counts>(sql`
    SELECT
      -- Sumber (satuan: baris file)
      (SELECT COALESCE(SUM(total_rows), 0) FROM import_batches WHERE source_type = 'DATABASE_ALL')::int AS src_rows_all_batches,
      (SELECT COALESCE(total_rows, 0) FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active LIMIT 1)::int AS src_rows_active,
      (SELECT COALESCE(valid_rows, 0) FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active LIMIT 1)::int AS src_valid_active,
      (SELECT COALESCE(excluded_rows, 0) FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active LIMIT 1)::int AS src_excluded_active,
      (SELECT COUNT(*) FROM staging_import_rows)::int AS staging_rows,

      -- Import exclusions (satuan: baris file) — tidak pernah jadi canonical
      (SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = 'MISSING_PHONE')::int AS excl_missing_phone,
      (SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = 'INVALID_PHONE')::int AS excl_invalid_phone,
      (SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = 'MISSING_NAME')::int AS excl_missing_name,
      (SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = 'INVALID_DATE')::int AS excl_invalid_date,
      (SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = 'UNKNOWN_PRODUCT')::int AS issue_unknown_product,

      -- Canonical (satuan berbeda-beda, jangan dijumlahkan lintas baris)
      (SELECT COUNT(*) FROM orders)::int AS orders_total,
      (SELECT COUNT(*) FROM order_items)::int AS items_total,
      (SELECT COUNT(*) FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE p.code = 'UNKNOWN')::int AS items_unknown,
      (SELECT COUNT(*) FROM ksb_transactions)::int AS ksb_transactions,
      (SELECT COUNT(DISTINCT source_transaction_key) FROM ksb_transactions)::int AS ksb_distinct_keys,

      -- Customer (satuan: customer)
      (SELECT COUNT(*) FROM customers)::int AS customers_total,
      (SELECT COUNT(*) FROM customers WHERE archived_at IS NOT NULL)::int AS customers_archived,
      (SELECT COUNT(*) FROM customers WHERE ksb_only)::int AS customers_ksb_only,
      (SELECT COUNT(DISTINCT customer_id) FROM orders)::int AS customers_with_orders,
      (SELECT COUNT(*) FROM customer_rfm_current)::int AS rfm_rows,
      (SELECT COUNT(*) FROM customer_rfm_current WHERE frequency > 0)::int AS rfm_probetes,
      (SELECT COUNT(*) FROM customer_rfm_current WHERE frequency = 0)::int AS rfm_ksb_only,
      (SELECT COUNT(*) FROM customer_cluster_current)::int AS cluster_rows,
      (SELECT COUNT(*) FROM customer_cluster_current
        WHERE cluster_code NOT IN ('NEEDS_REVIEW', 'YACONA_NON_COHORT', 'EXCLUDED_NO_PHONE'))::int AS cluster_official,
      (SELECT COUNT(*) FROM customer_cluster_current WHERE cluster_code = 'NEEDS_REVIEW')::int AS cluster_needs_review,
      (SELECT COUNT(*) FROM customer_cluster_current WHERE cluster_code = 'YACONA_NON_COHORT')::int AS cluster_yacona_non_cohort,

      -- Membership (satuan: membership)
      (SELECT COUNT(*) FROM customer_group_memberships)::int AS membership_rows,
      (SELECT COUNT(*) FROM customer_group_memberships WHERE status = 'GROUPED')::int AS membership_grouped,
      (SELECT COUNT(*) FROM customer_group_memberships WHERE status = 'NOT_GROUPED')::int AS membership_not_grouped,
      (SELECT COUNT(*) FROM customer_group_memberships WHERE status = 'UNKNOWN')::int AS membership_unknown,
      (SELECT COUNT(*) FROM customers c WHERE NOT EXISTS (
        SELECT 1 FROM customer_group_memberships gm WHERE gm.customer_id = c.id))::int AS membership_absent,

      -- Dedup (satuan: order / item)
      (SELECT COUNT(DISTINCT source_order_key) FROM orders)::int AS orders_distinct_keys,
      (SELECT COUNT(DISTINCT source_item_key) FROM order_items)::int AS items_distinct_keys,
      (SELECT COUNT(*) FROM (SELECT customer_id, order_date FROM orders GROUP BY 1,2 HAVING COUNT(*) > 1) x)::int AS orders_duplicate_day
  `);

  const n = result.rows[0] ?? ({} as Counts);
  const get = (key: string) => Number(n[key] ?? 0);

  const sections: ReconciliationSection[] = [
    {
      id: "sumber",
      title: "1. Sumber — Database All",
      description: "Satuan di bagian ini adalah BARIS FILE, bukan order dan bukan customer.",
      metrics: [
        { key: "src_rows_all_batches", label: "Total baris seluruh batch Database All", value: get("src_rows_all_batches"), universe: "row", note: "SUM(import_batches.total_rows) untuk source_type = DATABASE_ALL." },
        { key: "src_rows_active", label: "Baris pada batch aktif", value: get("src_rows_active"), universe: "row", note: "total_rows batch yang sedang aktif." },
        { key: "src_valid_active", label: "Baris valid (batch aktif)", value: get("src_valid_active"), universe: "row", note: "total_rows − excluded_rows pada batch aktif." },
        { key: "src_excluded_active", label: "Baris excluded (batch aktif)", value: get("src_excluded_active"), universe: "row", note: "Baris yang tidak pernah menjadi canonical." },
        { key: "staging_rows", label: "Baris tersimpan di staging", value: get("staging_rows"), universe: "row", note: "Raw disimpan utuh untuk audit; tidak pernah diedit.", drilldownHref: "/quality" },
      ],
      balance: {
        expression: "baris valid + baris excluded = baris batch aktif",
        left: get("src_valid_active") + get("src_excluded_active"),
        right: get("src_rows_active"),
        balanced: get("src_valid_active") + get("src_excluded_active") === get("src_rows_active"),
      },
    },
    {
      id: "exclusions",
      title: "2. Import Exclusions vs Needs Review",
      description:
        "Import Exclusion = baris yang TIDAK PERNAH jadi canonical. Needs Review = customer yang SUDAH valid tapi punya isu sekunder. Dua hal berbeda, satuannya pun berbeda.",
      metrics: [
        { key: "excl_missing_phone", label: "Exclusion · No. HP kosong", value: get("excl_missing_phone"), universe: "row", note: "MISSING_PHONE", drilldownHref: "/quality?issueType=MISSING_PHONE" },
        { key: "excl_invalid_phone", label: "Exclusion · No. HP invalid", value: get("excl_invalid_phone"), universe: "row", note: "INVALID_PHONE", drilldownHref: "/quality?issueType=INVALID_PHONE" },
        { key: "excl_missing_name", label: "Exclusion · nama kosong", value: get("excl_missing_name"), universe: "row", note: "MISSING_NAME", drilldownHref: "/quality?issueType=MISSING_NAME" },
        { key: "excl_invalid_date", label: "Exclusion · tanggal invalid", value: get("excl_invalid_date"), universe: "row", note: "INVALID_DATE", drilldownHref: "/quality?issueType=INVALID_DATE" },
        { key: "issue_unknown_product", label: "Isu · produk tidak dikenal", value: get("issue_unknown_product"), universe: "row", note: "UNKNOWN_PRODUCT — TIDAK menggagalkan import.", drilldownHref: "/mapping" },
        { key: "cluster_needs_review", label: "Needs Review (customer)", value: get("cluster_needs_review"), universe: "customer", note: "Customer valid yang cluster-nya bergantung data belum pasti.", drilldownHref: "/cluster?cluster=NEEDS_REVIEW" },
      ],
    },
    {
      id: "canonical",
      title: "3. Canonical transaksi",
      description: "Perhatikan satuannya: order ≠ item. Satu order dapat berisi banyak item.",
      metrics: [
        { key: "orders_total", label: "Order kanonik (1 customer + 1 tanggal)", value: get("orders_total"), universe: "order", note: "Definisi order mengikuti aturan perusahaan: satu hari = satu order." },
        { key: "items_total", label: "Item order", value: get("items_total"), universe: "item", note: "Satu baris file valid = satu item." },
        { key: "items_unknown", label: "Item berproduk UNKNOWN", value: get("items_unknown"), universe: "item", note: "Menunggu approval di Product Mapping.", drilldownHref: "/mapping" },
        { key: "ksb_transactions", label: "Transaksi KSB kanonik", value: get("ksb_transactions"), universe: "transaction", note: "Legacy KSB + item KSB dari Database All, sudah dedup." },
      ],
    },
    {
      id: "populasi",
      title: "4. Populasi customer",
      description:
        "Semua angka di sini satuannya CUSTOMER. Selisih antar baris di bawah bukan error — masing-masing menjawab pertanyaan berbeda.",
      metrics: [
        { key: "customers_total", label: "Customer kanonik (seluruhnya)", value: get("customers_total"), universe: "customer", note: "Termasuk yang hanya punya transaksi KSB." },
        { key: "customers_with_orders", label: "Customer Probetes (punya order)", value: get("customers_with_orders"), universe: "customer", note: "COUNT(DISTINCT customer_id) dari orders." },
        { key: "customers_ksb_only", label: "Customer KSB-only", value: get("customers_ksb_only"), universe: "customer", note: "Tidak pernah muncul di Database All." },
        { key: "rfm_rows", label: "Baris RFM", value: get("rfm_rows"), universe: "customer", note: "Termasuk customer KSB-murni (frequency = 0) agar Cluster B bisa dievaluasi." },
        { key: "rfm_probetes", label: "Populasi RFM Probetes (frequency > 0)", value: get("rfm_probetes"), universe: "customer", note: "Basis Dashboard/RFM — customer KSB-murni tidak ikut." },
        { key: "cluster_official", label: "Cluster resmi A1–F", value: get("cluster_official"), universe: "customer", note: "Tidak termasuk NEEDS_REVIEW / YACONA_NON_COHORT / EXCLUDED_NO_PHONE.", drilldownHref: "/cluster" },
        { key: "cluster_yacona_non_cohort", label: "YACONA_NON_COHORT", value: get("cluster_yacona_non_cohort"), universe: "customer", note: "Bukan cluster: hanya punya transaksi KSB dan belum memenuhi ambang B." },
        { key: "customers_archived", label: "Customer diarsip", value: get("customers_archived"), universe: "customer", note: "Disembunyikan dari daftar, TETAP dihitung di analytics." },
      ],
      balance: {
        expression: "customer Probetes + customer KSB-only = customer kanonik",
        left: get("customers_with_orders") + get("customers_ksb_only"),
        right: get("customers_total"),
        balanced: get("customers_with_orders") + get("customers_ksb_only") === get("customers_total"),
      },
    },
    {
      id: "cluster-balance",
      title: "5. Keseimbangan cluster",
      description: "Setiap baris RFM wajib punya tepat satu cluster — tidak boleh ada yang tercecer.",
      metrics: [
        { key: "cluster_rows", label: "Baris cluster", value: get("cluster_rows"), universe: "customer", note: "customer_cluster_current." },
        { key: "cluster_official", label: "Cluster resmi", value: get("cluster_official"), universe: "customer", note: "14 cluster A1–F." },
        { key: "cluster_needs_review", label: "Needs Review", value: get("cluster_needs_review"), universe: "customer", note: "Bukan cluster." },
        { key: "cluster_yacona_non_cohort", label: "Yacona non-cohort", value: get("cluster_yacona_non_cohort"), universe: "customer", note: "Bukan cluster." },
      ],
      balance: {
        expression: "cluster resmi + needs review + yacona non-cohort = baris cluster = baris RFM",
        left: get("cluster_official") + get("cluster_needs_review") + get("cluster_yacona_non_cohort"),
        right: get("rfm_rows"),
        balanced:
          get("cluster_official") + get("cluster_needs_review") + get("cluster_yacona_non_cohort") === get("rfm_rows") &&
          get("cluster_rows") === get("rfm_rows"),
      },
    },
    {
      id: "membership",
      title: "6. Membership grup",
      description:
        "Customer tanpa baris membership diperlakukan efektif NOT_GROUPED oleh rule engine (keputusan Q1), bukan UNKNOWN.",
      metrics: [
        { key: "membership_rows", label: "Baris membership", value: get("membership_rows"), universe: "membership", note: "Satu baris per customer." },
        { key: "membership_grouped", label: "GROUPED", value: get("membership_grouped"), universe: "membership", note: "Sumber legacy masukWA / BackupMasukGrup / keputusan CRM.", drilldownHref: "/groups?membershipStatus=GROUPED" },
        { key: "membership_not_grouped", label: "NOT_GROUPED eksplisit", value: get("membership_not_grouped"), universe: "membership", note: "Ada di daftar tidakmasukWA." },
        { key: "membership_unknown", label: "UNKNOWN (konflik sumber)", value: get("membership_unknown"), universe: "membership", note: "Muncul di daftar positif dan negatif sekaligus.", drilldownHref: "/groups?membershipStatus=CONFLICT" },
        { key: "membership_absent", label: "Tanpa baris membership", value: get("membership_absent"), universe: "customer", note: "Efektif NOT_GROUPED saat evaluasi cluster." },
      ],
      balance: {
        expression: "baris membership + customer tanpa baris = customer kanonik",
        left: get("membership_rows") + get("membership_absent"),
        right: get("customers_total"),
        balanced: get("membership_rows") + get("membership_absent") === get("customers_total"),
      },
    },
    {
      id: "dedup",
      title: "7. Dedup & integritas",
      description: "Idempotensi import bergantung pada unique key ini. Nilai yang tidak balance = duplikat.",
      metrics: [
        { key: "orders_total", label: "Order", value: get("orders_total"), universe: "order", note: "Total baris orders." },
        { key: "orders_distinct_keys", label: "source_order_key unik", value: get("orders_distinct_keys"), universe: "order", note: "Harus sama dengan total order." },
        { key: "items_total", label: "Item order", value: get("items_total"), universe: "item", note: "Total baris order_items." },
        { key: "items_distinct_keys", label: "source_item_key unik", value: get("items_distinct_keys"), universe: "item", note: "Harus sama dengan total item." },
        { key: "orders_duplicate_day", label: "Customer+tanggal ganda", value: get("orders_duplicate_day"), universe: "order", note: "Harus 0 — melanggar aturan satu hari = satu order." },
        { key: "ksb_distinct_keys", label: "source_transaction_key KSB unik", value: get("ksb_distinct_keys"), universe: "transaction", note: "Harus sama dengan total transaksi KSB." },
      ],
      balance: {
        expression: "order = key order unik, item = key item unik, KSB = key KSB unik, duplikat hari = 0",
        left:
          Number(get("orders_total") === get("orders_distinct_keys")) +
          Number(get("items_total") === get("items_distinct_keys")) +
          Number(get("ksb_transactions") === get("ksb_distinct_keys")) +
          Number(get("orders_duplicate_day") === 0),
        right: 4,
        balanced:
          get("orders_total") === get("orders_distinct_keys") &&
          get("items_total") === get("items_distinct_keys") &&
          get("ksb_transactions") === get("ksb_distinct_keys") &&
          get("orders_duplicate_day") === 0,
      },
    },
  ];

  return {
    asOfDate: ctx.asOfDate,
    generatedFrom: "Dihitung langsung dari tabel canonical & import_batches saat halaman dibuka.",
    sections,
  };
}
