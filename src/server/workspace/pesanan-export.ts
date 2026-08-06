import * as XLSX from "xlsx";
import type { WorkspaceOrderRow } from "@/lib/workspace-pesanan-contracts";

export type WorkspacePesananExportRow = Record<string, string | number>;

export function toWorkspacePesananExportRows(rows: WorkspaceOrderRow[]): WorkspacePesananExportRow[] {
  return rows.map((row) => ({
    NomorPesanan: row.orderNumber,
    NoOrderEverpro: row.sourceOrderId ?? "",
    Tanggal: row.orderDate,
    NamaKonsumen: row.customerName,
    NoHp: row.phoneDisplay,
    NamaCRM: row.crmNameSnapshot,
    RingkasanProduk: row.productsSummary.replace(/\n/g, "; "),
    TotalQty: row.totalQty,
    TotalSales: row.totalSalesValue,
    COS: row.cos,
    Pembayaran: row.paymentMethod,
    TOTAL: row.orderTotal,
    Status: row.status,
    SumberData: row.sourceType,
  }));
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/^[=+\-@]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toWorkspacePesananCsv(rows: WorkspacePesananExportRow[]): string {
  if (rows.length === 0) return "﻿";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h] ?? "")).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function toWorkspacePesananXlsxBuffer(rows: WorkspacePesananExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pesanan");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
