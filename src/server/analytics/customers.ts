/**
 * BACKEND — daftar & detail customer untuk drill-down.
 *
 * Satu pembangun filter melayani semua asal klik: kartu cluster, sel heatmap
 * retention (cohortMonth + activeMonthIndex), dan bar frequency
 * (cohortMonth + orderNumber / frequency bucket).
 *
 * Cakupan order mengikuti keputusan Q17: seluruh order kanonik, dengan
 * is_active hanya sebagai gerbang "sudah ada dataset atau belum".
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type {
  ClusterCustomerListResult,
  ClusterCustomerRow,
  ClusterDistributionItem,
  ClusterReason,
  CustomerDetail,
  CustomerListFilter,
  CustomerListResult,
  CustomerListRow,
  CustomerOrder,
  MembershipSummary,
} from "@/lib/customer-types";
import type { ClusterAssignmentCode } from "@/lib/cluster-codes";
import type { MembershipStatusValue } from "@/lib/membership-contracts";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

const HAS_ACTIVE_DATASET = sql`
  EXISTS (
    SELECT 1 FROM import_batches b
    WHERE b.source_type = 'DATABASE_ALL' AND b.is_active = true
  )
`;

/**
 * Sisa nomor setelah prefix dibuang, supaya "0812 3202", "812-3202", dan
 * "+62 812 3202" sama-sama cocok dengan normalized_phone "628123202…".
 */
function phoneFragment(value: string): string {
  const digits = value.replace(/\D+/g, "");
  if (digits.startsWith("62")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.replace(/^0+/, "");
  return digits;
}

/** Diekspor supaya export broadcast (FR-24) memakai filter yang SAMA PERSIS
 *  dengan daftar di layar — bukan query terpisah yang bisa menyimpang. */
export function buildCustomerConditions(filter: CustomerListFilter): SQL[] {
  return buildConditions(filter);
}

/**
 * Search global (header) — SENGAJA query ringan terpisah dari listCustomers:
 * tidak join RFM/cluster/membership/CS sama sekali, hanya id+nama+HP, karena
 * ini dipanggil per keystroke (debounced) dari header yang tampil di semua
 * halaman. Payload penuh listCustomers tidak perlu untuk sekadar "temukan
 * customer ini lalu buka detailnya".
 */
export async function quickSearchCustomers(
  query: string,
  limit = 8
): Promise<{ id: number; name: string; phone: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const fragment = phoneFragment(q);
  const db = getDb();
  const result = await db.execute<{ id: number; name: string | null; phone: string }>(sql`
    SELECT c.id, c.name, c.normalized_phone AS phone
    FROM customers c
    WHERE c.name IS NOT NULL AND btrim(c.name) <> '' AND c.archived_at IS NULL
      AND (
        c.name ILIKE ${"%" + q + "%"}
        ${fragment.length >= 3 ? sql`OR c.normalized_phone LIKE ${"%" + fragment + "%"}` : sql``}
      )
    ORDER BY c.name
    LIMIT ${Math.min(Math.max(limit, 1), 20)}
  `);
  return result.rows.map((row) => ({ id: row.id, name: row.name?.trim() || "(tanpa nama)", phone: row.phone }));
}

export function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) =>
    index === 0 ? condition : sql`${acc} AND ${condition}`
  );
}

/**
 * CURSOR (keyset) PAGINATION.
 *
 * Urutan tabel: monetary DESC, lalu c.id ASC sebagai pemecah seri. Dengan OFFSET,
 * setiap batch berikutnya harus memindai ulang seluruh baris sebelumnya —
 * halaman dalam makin lambat. Dengan cursor, batch berikutnya langsung melompat
 * ke posisi terakhir.
 *
 * `monetary` bisa NULL (customer tanpa baris RFM); COALESCE(...,-1) membuat
 * urutannya total tanpa mengubah hasil — semua monetary >= 0, jadi NULL tetap
 * di paling belakang persis seperti NULLS LAST sebelumnya.
 *
 * Perbandingan ditulis eksplisit (bukan row-comparison) karena arah kedua kolom
 * berbeda: monetary menurun, id menaik.
 */
const CURSOR_ORDER = sql`COALESCE(r.monetary, -1) DESC, c.id ASC`;

export function encodeCursor(monetary: string | null, customerId: number): string {
  return `${monetary ?? "-1"}:${customerId}`;
}

function cursorCondition(cursor: string | undefined): SQL | null {
  if (!cursor) return null;
  const [rawMonetary, rawId] = cursor.split(":");
  const id = Number(rawId);
  if (!rawMonetary || !Number.isInteger(id) || id <= 0) return null;
  if (!/^-?\d+$/.test(rawMonetary)) return null;
  return sql`(
    COALESCE(r.monetary, -1) < ${rawMonetary}::bigint
    OR (COALESCE(r.monetary, -1) = ${rawMonetary}::bigint AND c.id > ${id})
  )`;
}

function buildConditions(filter: CustomerListFilter): SQL[] {
  const conditions: SQL[] = [
    HAS_ACTIVE_DATASET,
    // Populasi CRM final (docs/07-OPEN-QUESTIONS.md): customer tanpa nama valid
    // tidak boleh muncul di list manapun. Pertahanan kedua — rebuildRfm sudah
    // menolak baris ini masuk customer_rfm_current sejak sumbernya.
    sql`c.name IS NOT NULL AND btrim(c.name) <> ''`,
  ];

  // Soft delete operasional: disembunyikan dari list kecuali diminta eksplisit.
  // Tidak pernah dipakai di analytics/queries.ts (RFM/Cohort/Frequency/Cluster tetap
  // menghitung seluruh customer) — murni housekeeping tampilan Customers/Group Membership.
  if (!filter.includeArchived) {
    conditions.push(sql`c.archived_at IS NULL`);
  }

  const search = filter.search?.trim();
  if (search) {
    // Nama dan nomor HP digabung dalam satu kotak pencarian (sesuai permintaan).
    const fragment = phoneFragment(search);
    conditions.push(
      fragment.length >= 3
        ? sql`(c.name ILIKE ${"%" + search + "%"} OR c.normalized_phone LIKE ${"%" + fragment + "%"})`
        : sql`c.name ILIKE ${"%" + search + "%"}`
    );
  }

  const cs = filter.cs?.trim();
  if (cs) {
    // CS adalah filter tersendiri: customer pernah dilayani CS ini.
    conditions.push(sql`
      EXISTS (
        SELECT 1 FROM orders o
        JOIN cs_agents a ON a.id = o.cs_id
        WHERE o.customer_id = c.id AND a.name = ${cs}
      )
    `);
  }

  if (filter.cluster) {
    conditions.push(sql`cc.cluster_code = ${filter.cluster}`);
  }

  if (filter.membershipStatus === "CONFLICT") {
    // Pseudo-status: UNKNOWN yang penyebabnya konflik source legacy, belum diselesaikan CRM.
    conditions.push(sql`
      gm.status = 'UNKNOWN' AND EXISTS (
        SELECT 1 FROM data_quality_issues dqi
        WHERE dqi.issue_type = 'GROUP_STATUS_CONFLICT'
          AND (dqi.detail->>'customerId')::int = c.id
      )
    `);
  } else if (filter.membershipStatus) {
    conditions.push(sql`COALESCE(gm.status, 'NOT_GROUPED') = ${filter.membershipStatus}`);
  }

  if (filter.pic?.trim()) {
    conditions.push(sql`pic.name = ${filter.pic.trim()}`);
  }

  if (filter.cohortMonth) {
    conditions.push(sql`to_char(r.cohort_month, 'YYYY-MM') = ${filter.cohortMonth}`);
  }

  // "Customer Baru" — customer yang first_seen_batch_id-nya SAMA dengan batch
  // Database All yang sedang aktif. Relatif terhadap batch aktif (bukan window
  // hari), jadi begitu ada commit import berikutnya, badge/filter ini otomatis
  // pindah ke customer dari upload TERBARU saja — bukan status permanen.
  if (filter.isNew) {
    conditions.push(sql`
      c.first_seen_batch_id = (
        SELECT id FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active = true
      )
    `);
  }

  if (typeof filter.frequency === "number") {
    conditions.push(sql`r.frequency = ${filter.frequency}`);
  }
  if (typeof filter.frequencyMin === "number") {
    conditions.push(sql`r.frequency >= ${filter.frequencyMin}`);
  }
  if (typeof filter.recencyMin === "number") {
    conditions.push(sql`r.recency_days >= ${filter.recencyMin}`);
  }
  if (typeof filter.recencyMax === "number") {
    conditions.push(sql`r.recency_days <= ${filter.recencyMax}`);
  }
  if (typeof filter.monetaryMin === "number") {
    conditions.push(sql`r.monetary >= ${filter.monetaryMin}`);
  }
  if (typeof filter.monetaryMax === "number") {
    conditions.push(sql`r.monetary <= ${filter.monetaryMax}`);
  }

  // Sel heatmap retention: cohort X yang aktif di bulan ke-N.
  if (filter.cohortMonth && typeof filter.activeMonthIndex === "number") {
    conditions.push(sql`
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.customer_id = c.id
          AND date_trunc('month', o.order_date)::date =
              (r.cohort_month + make_interval(months => ${filter.activeMonthIndex}))::date
      )
    `);
  }

  // Repeat purchase funnel: customer yang mencapai order ke-N.
  if (typeof filter.orderNumber === "number") {
    conditions.push(sql`r.frequency >= ${filter.orderNumber}`);
  }

  // Filter tanggal global di header (docs/07-OPEN-QUESTIONS.md Q16): membatasi
  // TAMPILAN daftar customer saja — tidak mengubah cohort_month/RFM/cluster.
  if (filter.orderDateFrom || filter.orderDateTo) {
    conditions.push(sql`
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.customer_id = c.id
          ${filter.orderDateFrom ? sql`AND o.order_date >= ${filter.orderDateFrom}::date` : sql``}
          ${filter.orderDateTo ? sql`AND o.order_date <= ${filter.orderDateTo}::date` : sql``}
      )
    `);
  }

  return conditions;
}

export async function listCustomers(filter: CustomerListFilter): Promise<CustomerListResult> {
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filter.page ?? 1, 1);
  const conditions = buildConditions(filter);
  const cursor = cursorCondition(filter.cursor);
  if (cursor) conditions.push(cursor);
  const where = andAll(conditions);
  const db = getDb();

  // COUNT hanya dijalankan saat batch PERTAMA (belum ada cursor). Batch
  // berikutnya tidak mengulang join penuh — totalnya tidak berubah selama
  // filter sama, dan hook di client mempertahankan nilai dari batch pertama.
  const needsTotal = !cursor;

  const [rows, totals] = await Promise.all([
    db.execute<{
      customer_id: number;
      normalized_phone: string;
      display_name: string | null;
      recency_days: number | null;
      frequency: number | null;
      monetary: string | null;
      last_order_date: string | null;
      cohort_month: string | null;
      cluster_code: ClusterAssignmentCode | null;
      membership_status: MembershipStatusValue;
      group_name: string | null;
      pic_name: string | null;
      cs_names: string | null;
      review_reason: string | null;
      is_new: boolean;
    }>(sql`
      SELECT
        c.id AS customer_id,
        c.normalized_phone,
        c.name AS display_name,
        r.recency_days,
        r.frequency,
        r.monetary::text AS monetary,
        r.last_order_date::text AS last_order_date,
        to_char(r.cohort_month, 'YYYY-MM') AS cohort_month,
        cc.cluster_code,
        COALESCE(gm.status, 'NOT_GROUPED') AS membership_status,
        gm.group_name,
        pic.name AS pic_name,
        (
          SELECT string_agg(DISTINCT a.name, ', ' ORDER BY a.name)
          FROM orders o
          JOIN cs_agents a ON a.id = o.cs_id
          WHERE o.customer_id = c.id
        ) AS cs_names,
        CASE WHEN cc.cluster_code = 'NEEDS_REVIEW' THEN
          (SELECT string_agg(elem->>'label', '; ') FROM jsonb_array_elements(cc.reason->'checks') elem)
        ELSE NULL END AS review_reason,
        (ab.id IS NOT NULL AND c.first_seen_batch_id = ab.id) AS is_new
      FROM customers c
      LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
      LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
      LEFT JOIN users pic ON pic.id = gm.pic_user_id
      LEFT JOIN import_batches ab ON ab.source_type = 'DATABASE_ALL' AND ab.is_active = true
      WHERE ${where}
      ORDER BY ${CURSOR_ORDER}
      LIMIT ${perPage}
    `),
    needsTotal
      ? db.execute<{ total: string }>(sql`
          SELECT COUNT(*)::text AS total
          FROM customers c
          LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
          LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
          LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
          LEFT JOIN users pic ON pic.id = gm.pic_user_id
          WHERE ${where}
        `)
      : Promise.resolve({ rows: [] as { total: string }[] }),
  ]);

  const last = rows.rows[rows.rows.length - 1];

  return {
    nextCursor:
      rows.rows.length === perPage && last ? encodeCursor(last.monetary, last.customer_id) : null,
    rows: rows.rows.map(
      (row): CustomerListRow => ({
        customerId: row.customer_id,
        normalizedPhone: row.normalized_phone,
        displayName: row.display_name?.trim() || "(tanpa nama)",
        recencyDays: row.recency_days,
        frequency: row.frequency ?? 0,
        monetary: row.monetary ?? "0",
        lastOrderDate: row.last_order_date,
        cohortMonth: row.cohort_month,
        clusterCode: row.cluster_code,
        membershipStatus: row.membership_status,
        groupName: row.group_name,
        picName: row.pic_name,
        csNames: row.cs_names ?? "—",
        reviewReason: row.review_reason,
        isNew: row.is_new,
      })
    ),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
  };
}

/**
 * Daftar customer untuk tabel Customer Cluster — Total Belanja (semua order),
 * Total Fisik (SUM order_items produk category=PHYSICAL saja), dan Produk yang
 * Dibeli (nama produk unik, digabung). Filter sama persis dengan listCustomers
 * (buildConditions) supaya "klik cluster -> tabel" tetap jumlahnya identik.
 */
export async function listClusterCustomers(filter: CustomerListFilter): Promise<ClusterCustomerListResult> {
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filter.page ?? 1, 1);
  const conditions = buildConditions(filter);
  const cursor = cursorCondition(filter.cursor);
  if (cursor) conditions.push(cursor);
  const where = andAll(conditions);
  const needsTotal = !cursor;
  const db = getDb();

  const [rows, totals] = await Promise.all([
    db.execute<{
      customer_id: number;
      normalized_phone: string;
      display_name: string | null;
      monetary: string | null;
      total_fisik: string | null;
      frequency: number | null;
      recency_days: number | null;
      first_order_date: string | null;
      membership_status: MembershipStatusValue;
      products_purchased: string | null;
      cs_names: string | null;
      is_new: boolean;
    }>(sql`
      SELECT
        c.id AS customer_id,
        c.normalized_phone,
        c.name AS display_name,
        r.monetary::text AS monetary,
        (
          SELECT COALESCE(SUM(oi.amount), 0)
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN products p ON p.id = oi.product_id
          WHERE o.customer_id = c.id AND p.category = 'PHYSICAL'
        )::text AS total_fisik,
        r.frequency,
        r.recency_days,
        r.first_order_date::text AS first_order_date,
        COALESCE(gm.status, 'NOT_GROUPED') AS membership_status,
        (
          SELECT string_agg(DISTINCT p.name, ', ' ORDER BY p.name)
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN products p ON p.id = oi.product_id
          WHERE o.customer_id = c.id
        ) AS products_purchased,
        (
          SELECT string_agg(DISTINCT a.name, ', ' ORDER BY a.name)
          FROM orders o
          JOIN cs_agents a ON a.id = o.cs_id
          WHERE o.customer_id = c.id
        ) AS cs_names,
        (ab.id IS NOT NULL AND c.first_seen_batch_id = ab.id) AS is_new
      FROM customers c
      LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
      LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
      LEFT JOIN users pic ON pic.id = gm.pic_user_id
      LEFT JOIN import_batches ab ON ab.source_type = 'DATABASE_ALL' AND ab.is_active = true
      WHERE ${where}
      ORDER BY ${CURSOR_ORDER}
      LIMIT ${perPage}
    `),
    needsTotal
      ? db.execute<{ total: string }>(sql`
          SELECT COUNT(*)::text AS total
          FROM customers c
          LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
          LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
          LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
          LEFT JOIN users pic ON pic.id = gm.pic_user_id
          WHERE ${where}
        `)
      : Promise.resolve({ rows: [] as { total: string }[] }),
  ]);

  const last = rows.rows[rows.rows.length - 1];

  return {
    nextCursor:
      rows.rows.length === perPage && last ? encodeCursor(last.monetary, last.customer_id) : null,
    rows: rows.rows.map(
      (row): ClusterCustomerRow => ({
        customerId: row.customer_id,
        normalizedPhone: row.normalized_phone,
        displayName: row.display_name?.trim() || "(tanpa nama)",
        totalBelanja: row.monetary ?? "0",
        totalFisik: row.total_fisik ?? "0",
        frequency: row.frequency ?? 0,
        recencyDays: row.recency_days,
        firstOrderDate: row.first_order_date,
        membershipStatus: row.membership_status,
        productsPurchased: row.products_purchased ?? "—",
        csNames: row.cs_names ?? "—",
        isNew: row.is_new,
      })
    ),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
  };
}

export async function getCustomerDetail(customerId: number): Promise<CustomerDetail | null> {
  const db = getDb();
  const [profile, orderRows, history, membershipHistory] = await Promise.all([
    db.execute<{
      customer_id: number;
      normalized_phone: string;
      display_phone: string | null;
      display_name: string | null;
      address: string | null;
      archived_at: string | null;
      first_order_date: string | null;
      last_order_date: string | null;
      recency_days: number | null;
      frequency: number | null;
      monetary: string | null;
      avg_order_value: string | null;
      customer_age_days: number | null;
      yacona_frequency: number | null;
      cohort_month: string | null;
      cluster_code: ClusterAssignmentCode | null;
      cluster_as_of_date: string | null;
      rule_version: string | null;
      reason: ClusterReason | null;
      membership_status: MembershipStatusValue;
      group_name: string | null;
      joined_at: string | null;
      pic_user_id: number | null;
      pic_name: string | null;
      notes: string | null;
      membership_updated_at: string | null;
      updated_by_name: string | null;
    }>(sql`
      SELECT
        c.id AS customer_id,
        c.normalized_phone,
        c.display_phone,
        c.name AS display_name,
        c.address,
        c.archived_at::text AS archived_at,
        r.first_order_date::text,
        r.last_order_date::text,
        r.recency_days,
        r.frequency,
        r.monetary::text AS monetary,
        r.avg_order_value::text AS avg_order_value,
        r.customer_age_days,
        r.yacona_frequency,
        to_char(r.cohort_month, 'YYYY-MM') AS cohort_month,
        cc.cluster_code,
        -- customer_cluster_current tidak menyimpan as_of_date; yang analitik
        -- adalah as_of_date di RFM (MAX(order_date) dataset aktif).
        r.as_of_date::text AS cluster_as_of_date,
        cc.rule_version,
        cc.reason,
        COALESCE(gm.status, 'UNKNOWN') AS membership_status,
        gm.group_name,
        gm.joined_at::text AS joined_at,
        gm.pic_user_id,
        pic.name AS pic_name,
        gm.notes,
        gm.updated_at::text AS membership_updated_at,
        updater.name AS updated_by_name
      FROM customers c
      LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
      LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
      LEFT JOIN users pic ON pic.id = gm.pic_user_id
      LEFT JOIN users updater ON updater.id = gm.updated_by
      WHERE c.id = ${customerId}
    `),
    db.execute<{
      order_id: number;
      order_date: string;
      order_total: string;
      platform: string | null;
      payment_method: string | null;
      cs_name: string | null;
      product_code: string;
      raw_product_name: string;
      qty: string | null;
      amount: string;
      is_bonus: boolean;
    }>(sql`
      SELECT
        o.id AS order_id,
        o.order_date::text,
        o.order_total::text,
        o.platform,
        o.payment_method,
        a.name AS cs_name,
        p.code AS product_code,
        oi.raw_product_name,
        oi.qty::text AS qty,
        oi.amount::text AS amount,
        oi.is_bonus
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN cs_agents a ON a.id = o.cs_id
      WHERE o.customer_id = ${customerId}
      ORDER BY o.order_date DESC, o.id DESC, oi.id
    `),
    db.execute<{ cluster_code: string; valid_from: string; valid_to: string | null }>(sql`
      SELECT cluster_code, valid_from::text, valid_to::text
      FROM customer_cluster_history
      WHERE customer_id = ${customerId}
      ORDER BY valid_from DESC
    `),
    db.execute<{
      old_status: string | null;
      new_status: string;
      source: string;
      changed_at: string;
      changed_by_name: string | null;
    }>(sql`
      SELECT h.old_status, h.new_status, h.source, h.changed_at::text AS changed_at, u.name AS changed_by_name
      FROM customer_group_membership_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.customer_id = ${customerId}
      ORDER BY h.changed_at DESC
    `),
  ]);

  const row = profile.rows[0];
  if (!row) return null;

  const orders = new Map<number, CustomerOrder>();
  for (const item of orderRows.rows) {
    const order = orders.get(item.order_id) ?? {
      orderId: item.order_id,
      orderDate: item.order_date,
      orderTotal: item.order_total,
      platform: item.platform,
      paymentMethod: item.payment_method,
      csName: item.cs_name,
      items: [],
    };
    order.items.push({
      productCode: item.product_code,
      rawProductName: item.raw_product_name,
      qty: item.qty,
      amount: item.amount,
      isBonus: item.is_bonus,
    });
    orders.set(item.order_id, order);
  }

  return {
    customerId: row.customer_id,
    normalizedPhone: row.normalized_phone,
    displayPhone: row.display_phone,
    displayName: row.display_name?.trim() || "(tanpa nama)",
    address: row.address,
    archivedAt: row.archived_at,
    firstOrderDate: row.first_order_date,
    lastOrderDate: row.last_order_date,
    recencyDays: row.recency_days,
    frequency: row.frequency ?? 0,
    monetary: row.monetary ?? "0",
    avgOrderValue: row.avg_order_value,
    customerAgeDays: row.customer_age_days,
    yaconaFrequency: row.yacona_frequency ?? 0,
    cohortMonth: row.cohort_month,
    clusterCode: row.cluster_code,
    clusterAsOfDate: row.cluster_as_of_date,
    ruleVersion: row.rule_version,
    reason: row.reason,
    membership: {
      status: row.membership_status,
      groupName: row.group_name,
      joinedAt: row.joined_at,
      picUserId: row.pic_user_id,
      picName: row.pic_name,
      notes: row.notes,
      updatedAt: row.membership_updated_at,
      updatedByName: row.updated_by_name,
    },
    orders: [...orders.values()],
    clusterHistory: history.rows.map((h) => ({
      clusterCode: h.cluster_code,
      validFrom: h.valid_from,
      validTo: h.valid_to,
    })),
    membershipHistory: membershipHistory.rows.map((h) => ({
      oldStatus: h.old_status,
      newStatus: h.new_status,
      source: h.source,
      changedAt: h.changed_at,
      changedByName: h.changed_by_name,
    })),
  };
}

/** Jumlah customer + total monetary per cluster (termasuk status non-cluster). */
export async function getClusterDistribution(): Promise<ClusterDistributionItem[]> {
  const result = await getDb().execute<{ code: string; customers: number; monetary: string }>(sql`
    SELECT
      cc.cluster_code AS code,
      COUNT(*)::int AS customers,
      COALESCE(SUM(r.monetary), 0)::text AS monetary
    FROM customer_cluster_current cc
    LEFT JOIN customer_rfm_current r ON r.customer_id = cc.customer_id
    WHERE ${HAS_ACTIVE_DATASET}
    GROUP BY cc.cluster_code
  `);
  return result.rows.map((row) => ({
    code: row.code,
    customers: row.customers,
    monetary: row.monetary,
  }));
}

/** Daftar CS untuk dropdown filter (terpisah dari pencarian nama/HP). */
export async function listCsAgents(): Promise<string[]> {
  const result = await getDb().execute<{ display_name: string }>(sql`
    SELECT DISTINCT a.name AS display_name
    FROM cs_agents a
    JOIN orders o ON o.cs_id = a.id
    WHERE ${HAS_ACTIVE_DATASET}
    ORDER BY a.name
  `);
  return result.rows.map((row) => row.display_name);
}

/** Daftar user (PIC/CRM) yang sedang di-assign ke minimal satu customer. */
export async function listPics(): Promise<{ id: number; name: string }[]> {
  const result = await getDb().execute<{ id: number; name: string }>(sql`
    SELECT DISTINCT u.id, u.name
    FROM users u
    JOIN customer_group_memberships gm ON gm.pic_user_id = u.id
    ORDER BY u.name
  `);
  return result.rows;
}

/**
 * 5 tile ringkasan halaman Group Membership — semua real-time dari Neon, tanpa
 * mock. unknownOperational mencakup customer TANPA baris membership sama
 * sekali (COALESCE ke UNKNOWN), bukan cuma yang punya baris status=UNKNOWN
 * eksplisit — sesuai semantik "no row = UNKNOWN".
 */
export async function getMembershipSummary(): Promise<MembershipSummary> {
  const result = await getDb().execute<{
    grouped: string;
    not_grouped: string;
    unknown_operational: string;
    unresolved_conflict: string;
    needs_review_membership: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM customers c
        LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
        WHERE ${HAS_ACTIVE_DATASET} AND COALESCE(gm.status, 'NOT_GROUPED') = 'GROUPED')::text AS grouped,
      (SELECT COUNT(*) FROM customers c
        LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
        WHERE ${HAS_ACTIVE_DATASET} AND COALESCE(gm.status, 'NOT_GROUPED') = 'NOT_GROUPED')::text AS not_grouped,
      (SELECT COUNT(*) FROM customers c
        LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
        WHERE ${HAS_ACTIVE_DATASET} AND gm.status = 'UNKNOWN')::text AS unknown_operational,
      (SELECT COUNT(DISTINCT (dqi.detail->>'customerId')::int) FROM data_quality_issues dqi
        JOIN customer_group_memberships gm ON gm.customer_id = (dqi.detail->>'customerId')::int
        WHERE dqi.issue_type = 'GROUP_STATUS_CONFLICT' AND gm.status = 'UNKNOWN')::text AS unresolved_conflict,
      (SELECT COUNT(*) FROM customer_cluster_current cc
        JOIN customers c ON c.id = cc.customer_id
        WHERE ${HAS_ACTIVE_DATASET} AND cc.cluster_code = 'NEEDS_REVIEW'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(cc.reason->'checks') elem
            WHERE elem->>'label' ILIKE 'Status grup%'
          ))::text AS needs_review_membership
  `);
  const row = result.rows[0];
  return {
    grouped: Number(row?.grouped ?? 0),
    notGrouped: Number(row?.not_grouped ?? 0),
    unknownOperational: Number(row?.unknown_operational ?? 0),
    unresolvedConflict: Number(row?.unresolved_conflict ?? 0),
    needsReviewMembership: Number(row?.needs_review_membership ?? 0),
  };
}
