import * as XLSX from "xlsx";
import type { WorkspaceProductRow } from "@/lib/workspace-master-data-contracts";

export type WorkspaceProductExportRow = Record<string, string | number>;

export function toWorkspaceProductExportRows(rows: WorkspaceProductRow[]): WorkspaceProductExportRow[] {
  return rows.map((row) => ({
    ProductID: row.productId,
    NamaProduk: row.productName,
    JenisProduk: row.productUsage,
    HargaJual: row.sellingPrice == null ? 0 : Number(row.sellingPrice),
    HPP: Number(row.unitHpp),
    Status: row.isActive ? "Aktif" : "Nonaktif",
    JumlahAlias: row.aliasCount,
    JumlahTransaksi: row.usageCount,
    Keterangan: row.description ?? "",
    DibuatPada: row.createdAt,
    DiperbaruiPada: row.updatedAt,
  }));
}

export function escapeProductCsvCell(value: string | number): string {
  const source = String(value);
  const safe = /^[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toWorkspaceProductCsv(rows: WorkspaceProductExportRow[]): string {
  if (!rows.length) return "﻿";
  const headers = Object.keys(rows[0]!);
  return "﻿" + [headers.join(","), ...rows.map((row) => headers.map((header) => escapeProductCsvCell(row[header] ?? "")).join(","))].join("\r\n");
}

export function toWorkspaceProductXlsxBuffer(rows: WorkspaceProductExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  worksheet["!cols"] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 34 },
    { wch: 24 },
    { wch: 24 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Master Produk");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
