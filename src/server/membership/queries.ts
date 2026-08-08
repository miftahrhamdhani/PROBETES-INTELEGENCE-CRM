/**
 * BACKEND — daftar & ringkasan Group Membership.
 *
 * SATU aturan yang mengikat seluruh file ini: halaman Group Membership HANYA
 * berisi customer yang SUDAH masuk grup (`status = 'GROUPED'`). Baris
 * NOT_GROUPED/UNKNOWN tetap ada di database karena cluster engine memakainya
 * (COALESCE(gm.status,'NOT_GROUPED') di rebuildClusters), tapi tidak pernah
 * muncul di halaman ini.
 *
 * Membaca data yang sudah ada saja — tidak menghitung ulang cluster/RFM apa pun.
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { ClusterAssignmentCode } from "@/lib/cluster-codes";
import type { ClusterReason } from "@/lib/customer-types";
import type {
  GroupMemberDetail,
  GroupMemberFilter,
  GroupMemberListResult,
  GroupMemberRow,
  GroupMembershipKpi,
  GroupMembershipSourceValue,
} from "@/lib/group-membership-types";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

/** Gerbang tunggal halaman ini. */
const ONLY_GROUPED = sql`gm.status = 'GROUPED'`;

function phoneFragment(value: string): string {
  const digits = value.replace(/\D+/g, "");
  if (digits.startsWith("62")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.replace(/^0+/, "");
  return digits;
}

function buildConditions(filter: GroupMemberFilter): SQL[] {
  const conditions: SQL[] = [
    ONLY_GROUPED,
    // Populasi CRM: customer tanpa nama valid tidak pernah tampil di list mana pun.
    sql`c.name IS NOT NULL AND btrim(c.name) <> ''`,
    sql`c.archived_at IS NULL`,
  ];

  const search = filter.search?.trim();
  if (search) {
    // Nomor HP dicari lewat sisa digit setelah prefix, sehingga "0812…",
    // "62812…", dan "+62 812…" sama-sama cocok (pola sama dengan Customers).
    const fragment = phoneFragment(search);
    conditions.push(
      fragment.length >= 3
        ? sql`(c.name ILIKE ${"%" + search + "%"} OR c.normalized_phone LIKE ${"%" + fragment + "%"})`
        : sql`c.name ILIKE ${"%" + search + "%"}`
    );
  }
  if (filter.cluster) conditions.push(sql`cc.cluster_code = ${filter.cluster}`);
  if (filter.groupName) conditions.push(sql`gm.group_name = ${filter.groupName}`);
  if (filter.pic?.trim()) conditions.push(sql`pic.name = ${filter.pic.trim()}`);
  if (filter.joinedFrom) conditions.push(sql`gm.joined_at >= ${filter.joinedFrom}::date`);
  if (filter.joinedTo) conditions.push(sql`gm.joined_at <= ${filter.joinedTo}::date`);

  return conditions;
}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

const FROM_MEMBERS = sql`
  FROM customer_group_memberships gm
  JOIN customers c ON c.id = gm.customer_id
  LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
  LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
  LEFT JOIN users pic ON pic.id = gm.pic_user_id
`;

export async function listGroupMembers(filter: GroupMemberFilter): Promise<GroupMemberListResult> {
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filter.page ?? 1, 1);
  const where = andAll(buildConditions(filter));
  const db = getDb();

  const [rows, totals] = await Promise.all([
    db.execute<{
      customer_id: number;
      normalized_phone: string;
      display_name: string | null;
      cluster_code: ClusterAssignmentCode | null;
      group_name: string | null;
      pic_user_id: number | null;
      pic_name: string | null;
      joined_at: string | null;
      last_order_date: string | null;
      source: GroupMembershipSourceValue;
    }>(sql`
      SELECT c.id AS customer_id, c.normalized_phone, c.name AS display_name,
             cc.cluster_code, gm.group_name, gm.pic_user_id, pic.name AS pic_name,
             gm.joined_at::text AS joined_at, r.last_order_date::text AS last_order_date,
             gm.source::text AS source
      ${FROM_MEMBERS}
      WHERE ${where}
      ORDER BY gm.joined_at DESC NULLS LAST, c.id ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `),
    db.execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total ${FROM_MEMBERS} WHERE ${where}`),
  ]);

  return {
    rows: rows.rows.map(
      (row): GroupMemberRow => ({
        customerId: row.customer_id,
        normalizedPhone: row.normalized_phone,
        displayName: row.display_name?.trim() || "(tanpa nama)",
        clusterCode: row.cluster_code,
        groupName: row.group_name,
        picUserId: row.pic_user_id,
        picName: row.pic_name,
        joinedAt: row.joined_at,
        lastOrderDate: row.last_order_date,
        source: row.source,
      })
    ),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
  };
}

/** Nama grup yang benar-benar dipakai — untuk dropdown filter "Grup Konsultasi". */
export async function listGroupNames(): Promise<string[]> {
  const result = await getDb().execute<{ group_name: string }>(sql`
    SELECT DISTINCT group_name FROM customer_group_memberships
    WHERE status = 'GROUPED' AND group_name IS NOT NULL AND btrim(group_name) <> ''
    ORDER BY group_name
  `);
  return result.rows.map((row) => row.group_name);
}

export async function getGroupMembershipKpi(): Promise<GroupMembershipKpi> {
  const db = getDb();
  const [main, lastImport] = await Promise.all([
    db.execute<{
      total_members: string;
      new_this_month: string;
      active_groups: string;
      last_updated_at: string | null;
      last_updated_by: string | null;
    }>(sql`
      SELECT
        COUNT(*)::text AS total_members,
        -- joined_at dibiarkan apa adanya: membership legacy tanpa tanggal TIDAK
        -- dihitung dan TIDAK diperkirakan dari sumber lain.
        COUNT(*) FILTER (
          WHERE gm.joined_at IS NOT NULL
            AND date_trunc('month', gm.joined_at) = date_trunc('month', CURRENT_DATE)
        )::text AS new_this_month,
        COUNT(DISTINCT gm.group_name) FILTER (WHERE btrim(COALESCE(gm.group_name,'')) <> '')::text AS active_groups,
        MAX(gm.updated_at)::text AS last_updated_at,
        (
          SELECT u.name FROM customer_group_memberships g2
          LEFT JOIN users u ON u.id = g2.updated_by
          WHERE g2.status = 'GROUPED' AND g2.updated_at IS NOT NULL
          ORDER BY g2.updated_at DESC LIMIT 1
        ) AS last_updated_by
      FROM customer_group_memberships gm
      JOIN customers c ON c.id = gm.customer_id
      WHERE ${ONLY_GROUPED} AND c.name IS NOT NULL AND btrim(c.name) <> '' AND c.archived_at IS NULL
    `),
    // Import grup memakai infrastruktur import_batches yang sudah ada
    // (source_type GROUP_LIST). "Unmatched" = baris file yang tidak ketemu
    // customer-nya, disimpan pada excluded_rows batch tersebut.
    db.execute<{ excluded_rows: number }>(sql`
      SELECT excluded_rows FROM import_batches
      WHERE source_type = 'GROUP_LIST' ORDER BY id DESC LIMIT 1
    `),
  ]);

  const row = main.rows[0];
  return {
    totalMembers: Number(row?.total_members ?? 0),
    newThisMonth: Number(row?.new_this_month ?? 0),
    activeGroups: Number(row?.active_groups ?? 0),
    unmatchedLastImport: lastImport.rows[0]?.excluded_rows ?? null,
    lastUpdatedAt: row?.last_updated_at ?? null,
    lastUpdatedByName: row?.last_updated_by ?? null,
  };
}

export async function getGroupMemberDetail(customerId: number): Promise<GroupMemberDetail | null> {
  const result = await getDb().execute<{
    customer_id: number;
    normalized_phone: string;
    display_name: string | null;
    cluster_code: ClusterAssignmentCode | null;
    group_name: string | null;
    pic_user_id: number | null;
    pic_name: string | null;
    joined_at: string | null;
    last_order_date: string | null;
    source: GroupMembershipSourceValue;
    notes: string | null;
    first_order_date: string | null;
    frequency: number | null;
    monetary: string | null;
    last_product_name: string | null;
    last_order_division: string | null;
    updated_at: string | null;
    updated_by_name: string | null;
    cluster_reason: ClusterReason | null;
    cluster_as_of_date: string | null;
  }>(sql`
    SELECT c.id AS customer_id, c.normalized_phone, c.name AS display_name,
           cc.cluster_code, gm.group_name, gm.pic_user_id, pic.name AS pic_name,
           gm.joined_at::text AS joined_at, r.last_order_date::text AS last_order_date,
           gm.source::text AS source, gm.notes, cc.reason AS cluster_reason,
           (cc.reason->>'asOfDate') AS cluster_as_of_date,
           r.first_order_date::text AS first_order_date, r.frequency, r.monetary::text AS monetary,
           (
             SELECT oi.raw_product_name FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.customer_id = c.id
             ORDER BY o.order_date DESC, o.id DESC, oi.id DESC LIMIT 1
           ) AS last_product_name,
           (
             SELECT o.division FROM orders o
             WHERE o.customer_id = c.id ORDER BY o.order_date DESC, o.id DESC LIMIT 1
           ) AS last_order_division,
           gm.updated_at::text AS updated_at,
           updater.name AS updated_by_name
    ${FROM_MEMBERS}
    LEFT JOIN users updater ON updater.id = gm.updated_by
    WHERE ${ONLY_GROUPED} AND c.id = ${customerId}
  `);

  const row = result.rows[0];
  if (!row) return null;
  return {
    customerId: row.customer_id,
    normalizedPhone: row.normalized_phone,
    displayName: row.display_name?.trim() || "(tanpa nama)",
    clusterCode: row.cluster_code,
    groupName: row.group_name,
    picUserId: row.pic_user_id,
    picName: row.pic_name,
    joinedAt: row.joined_at,
    lastOrderDate: row.last_order_date,
    source: row.source,
    notes: row.notes,
    firstOrderDate: row.first_order_date,
    frequency: row.frequency ?? 0,
    monetary: row.monetary ?? "0",
    lastProductName: row.last_product_name,
    lastOrderDivision: row.last_order_division,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
    clusterReason: row.cluster_reason,
    clusterAsOfDate: row.cluster_as_of_date,
  };
}
