import * as XLSX from "xlsx";
import type { CrmReportExportRow } from "./service";

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV dengan BOM UTF-8 supaya Excel Windows membaca karakter non-ASCII dengan benar. */
export function toCsv(rows: CrmReportExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h] ?? "")).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}

export function toXlsxBuffer(rows: CrmReportExportRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "CRM Report");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
