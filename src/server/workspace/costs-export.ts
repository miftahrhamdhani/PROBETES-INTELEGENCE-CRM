import * as XLSX from "xlsx";
import type { WorkspaceCostRow } from "@/lib/workspace-cost-contracts";

export type WorkspaceCostExportRow = Record<string, string | number>;

export function toWorkspaceCostExportRows(rows: WorkspaceCostRow[]): WorkspaceCostExportRow[] {
  return rows.map((row) => ({
    TanggalBiaya: row.costDate,
    NamaBiaya: row.costName,
    Kategori: row.category,
    Vendor: row.vendor ?? "",
    PeriodePenggunaan: row.usagePeriod ?? "",
    MetodePembayaran: row.paymentMethod ?? "",
    NomorReferensi: row.referenceNumber ?? "",
    Nominal: Number(row.amount),
    DibuatOleh: row.createdByName ?? "",
    Status: row.status,
  }));
}

export function escapeCostCsvCell(value: string | number): string {
  const source = String(value);
  const safe = /^[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toWorkspaceCostCsv(rows: WorkspaceCostExportRow[]): string {
  if (!rows.length) return "﻿";
  const headers = Object.keys(rows[0]!);
  return "﻿" + [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCostCsvCell(row[header] ?? "")).join(","))].join("\r\n");
}

export function toWorkspaceCostXlsxBuffer(rows: WorkspaceCostExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Biaya Operasional");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
