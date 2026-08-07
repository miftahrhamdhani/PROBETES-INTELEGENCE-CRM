import { clusterLabel } from "./customer-columns";
import { formatDate, formatRupiah } from "@/lib/format";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/membership-contracts";
import type { CustomerListRow } from "@/lib/customer-types";

/**
 * "Export Terpilih" — CSV dibangun 100% di browser dari baris yang SUDAH
 * dimuat & dicentang (tidak ada round-trip server baru). Beda dari Export
 * Broadcast (server-side, FR-24, seluruh hasil filter): ini hanya baris yang
 * eksplisit dicentang user, jadi cukup dari data yang sudah ada di client.
 */
const SELECTED_EXPORT_HEADERS = [
  "No",
  "No HP",
  "Nama",
  "Cluster",
  "Status Grup",
  "Nama Grup",
  "PIC",
  "Sumber",
  "R (hari)",
  "F",
  "M",
  "Last Order",
  "CS",
] as const;

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildSelectedCustomersCsv(rows: CustomerListRow[]): string {
  const header = SELECTED_EXPORT_HEADERS.map(csvCell).join(",");
  const body = rows.map((row, index) =>
    [
      String(index + 1),
      row.normalizedPhone,
      row.displayName,
      clusterLabel(row.clusterCode),
      MEMBERSHIP_STATUS_LABELS[row.membershipStatus],
      row.groupName ?? "—",
      row.picName ?? "—",
      row.firstOrderDivision ?? "—",
      row.recencyDays != null ? String(row.recencyDays) : "—",
      String(row.frequency),
      formatRupiah(row.monetary),
      formatDate(row.lastOrderDate),
      row.csNames,
    ]
      .map(csvCell)
      .join(",")
  );
  // BOM supaya Excel membaca UTF-8 dengan benar (nama customer sering ber-aksen).
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

export function downloadSelectedCustomersCsv(rows: CustomerListRow[], filename = "customer-terpilih.csv"): void {
  const csv = buildSelectedCustomersCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
