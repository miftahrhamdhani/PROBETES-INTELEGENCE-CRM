/**
 * BACKEND — FR-24: export daftar broadcast per cluster.
 *
 * Memakai buildConditions() YANG SAMA dengan listCustomers/listClusterCustomers,
 * jadi isi export selalu identik dengan yang sedang dilihat di layar: tidak ada
 * customer di luar hasil filter, dan tidak ada yang hilang.
 *
 * Hanya customer dengan nama DAN nomor HP valid yang ikut — daftar ini dipakai
 * untuk mengirim pesan, jadi baris tanpa identitas tidak berguna dan tidak boleh
 * ikut terkirim.
 */
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getDb } from "@/server/db/client";
import { buildCustomerConditions, andAll } from "./customers";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import { MEMBERSHIP_STATUS_LABELS, type MembershipStatusValue } from "@/lib/membership-contracts";
import type { CustomerListFilter } from "@/lib/customer-types";

/** Batas aman satu berkas export — melindungi memori server. */
export const BROADCAST_EXPORT_MAX_ROWS = 50_000;

export type BroadcastExportRow = {
  no: number;
  noHp: string;
  nama: string;
  cluster: string;
  statusGrup: string;
  pic: string;
  totalBelanja: string;
  frequency: number;
  recency: string;
  produkDibeli: string;
  cs: string;
};

export const BROADCAST_EXPORT_HEADERS = [
  "No",
  "No HP",
  "Nama",
  "Cluster",
  "Status Grup",
  "PIC",
  "Total Belanja",
  "Frequency",
  "Recency",
  "Produk Dibeli",
  "CS",
] as const;

function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "—";
  return (
    (CLUSTER_LABELS as Record<string, string>)[code] ??
    (NON_CLUSTER_LABELS as Record<string, string>)[code] ??
    code
  );
}

export async function buildBroadcastRows(filter: CustomerListFilter): Promise<BroadcastExportRow[]> {
  const conditions = buildCustomerConditions(filter);
  // Daftar broadcast: wajib punya nomor HP ternormalisasi yang valid.
  conditions.push(sql`c.normalized_phone ~ '^62[0-9]{7,15}$'`);

  const result = await getDb().execute<{
    normalized_phone: string;
    display_name: string;
    cluster_code: ClusterAssignmentCode | null;
    membership_status: MembershipStatusValue;
    pic_name: string | null;
    monetary: string | null;
    frequency: number | null;
    recency_days: number | null;
    products_purchased: string | null;
    cs_names: string | null;
  }>(sql`
    SELECT
      c.normalized_phone,
      c.name AS display_name,
      cc.cluster_code,
      COALESCE(gm.status, 'NOT_GROUPED') AS membership_status,
      pic.name AS pic_name,
      r.monetary::text AS monetary,
      r.frequency,
      r.recency_days,
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
      ) AS cs_names
    FROM customers c
    LEFT JOIN customer_rfm_current r ON r.customer_id = c.id
    LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
    LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
    LEFT JOIN users pic ON pic.id = gm.pic_user_id
    WHERE ${andAll(conditions)}
    ORDER BY r.monetary DESC NULLS LAST, c.id
    LIMIT ${BROADCAST_EXPORT_MAX_ROWS}
  `);

  return result.rows.map((row, index) => ({
    no: index + 1,
    noHp: row.normalized_phone,
    nama: row.display_name,
    cluster: clusterLabel(row.cluster_code),
    statusGrup: MEMBERSHIP_STATUS_LABELS[row.membership_status] ?? row.membership_status,
    pic: row.pic_name ?? "—",
    totalBelanja: row.monetary ?? "0",
    frequency: row.frequency ?? 0,
    recency: row.recency_days === null ? "" : String(row.recency_days),
    produkDibeli: row.products_purchased ?? "—",
    cs: row.cs_names ?? "—",
  }));
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Seluruh kolom dikutip, dan nomor HP diawali tanda kutip sehingga Excel
 * membacanya sebagai TEXT — tanpa ini "6281..." berubah jadi notasi ilmiah
 * (6,28E+12) dan nomornya rusak.
 */
export function broadcastRowsToCsv(rows: BroadcastExportRow[]): string {
  const header = BROADCAST_EXPORT_HEADERS.map(csvCell).join(",");
  const body = rows.map((row) =>
    [
      String(row.no),
      row.noHp,
      row.nama,
      row.cluster,
      row.statusGrup,
      row.pic,
      row.totalBelanja,
      String(row.frequency),
      row.recency,
      row.produkDibeli,
      row.cs,
    ]
      .map(csvCell)
      .join(",")
  );
  // BOM supaya Excel membaca UTF-8 dengan benar (nama customer sering ber-aksen).
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

export function broadcastRowsToXlsx(rows: BroadcastExportRow[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...BROADCAST_EXPORT_HEADERS],
    ...rows.map((row) => [
      row.no,
      row.noHp, // ditulis sebagai string; tipe sel dipaksa text di bawah
      row.nama,
      row.cluster,
      row.statusGrup,
      row.pic,
      Number(row.totalBelanja),
      row.frequency,
      row.recency === "" ? "" : Number(row.recency),
      row.produkDibeli,
      row.cs,
    ]),
  ]);

  // Kolom B (No HP) dipaksa bertipe teks supaya tidak dikonversi jadi angka.
  for (let i = 0; i < rows.length; i++) {
    const address = XLSX.utils.encode_cell({ c: 1, r: i + 1 });
    const cell = sheet[address];
    if (cell) {
      cell.t = "s";
      cell.z = "@";
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Broadcast");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
