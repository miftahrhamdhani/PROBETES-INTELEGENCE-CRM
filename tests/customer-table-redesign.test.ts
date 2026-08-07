/**
 * Redesign tabel Customers (tampilan) — bagian ini murni fungsi pure yang
 * dites tanpa render React, sama pola dengan tests/data-table.test.ts
 * (rectanglesIntersect). Tidak ada perubahan backend/query di redesign ini —
 * hanya "Tampilan Kolom" (localStorage) dan "Export Terpilih" (CSV client-side)
 * yang punya logic murni untuk dites.
 */
import { describe, expect, it } from "vitest";
import { parseStoredHiddenColumns, serializeHiddenColumns } from "@/components/customer/column-visibility";
import { buildSelectedCustomersCsv } from "@/components/customer/client-export";
import type { CustomerListRow } from "@/lib/customer-types";

describe("Tampilan Kolom — persist hidden columns", () => {
  const validIds = ["recency", "frequency", "monetary", "pic"];

  it("mengembalikan array kosong kalau localStorage belum pernah diisi", () => {
    expect(parseStoredHiddenColumns(null, validIds)).toEqual([]);
  });

  it("mengembalikan array kosong kalau isi localStorage bukan JSON valid", () => {
    expect(parseStoredHiddenColumns("{bukan json", validIds)).toEqual([]);
    expect(parseStoredHiddenColumns('"bukan-array"', validIds)).toEqual([]);
  });

  it("membuang id yang bukan kolom valid (mis. dari versi kolom lama)", () => {
    expect(parseStoredHiddenColumns(JSON.stringify(["recency", "kolom-lama-yang-sudah-dihapus"]), validIds)).toEqual([
      "recency",
    ]);
  });

  it("round-trip serialize/parse", () => {
    const hidden = ["pic", "monetary"];
    expect(parseStoredHiddenColumns(serializeHiddenColumns(hidden), validIds)).toEqual(hidden);
  });
});

describe("Export Terpilih — CSV client-side", () => {
  function row(overrides: Partial<CustomerListRow> = {}): CustomerListRow {
    return {
      customerId: 1,
      normalizedPhone: "6281234567890",
      displayName: "Ibu Ani",
      recencyDays: 5,
      frequency: 3,
      monetary: "150000",
      lastOrderDate: "2026-07-01",
      cohortMonth: "2026-01",
      clusterCode: "A1",
      membershipStatus: "GROUPED",
      groupName: "Grup WA 1",
      picName: "Budi",
      csNames: "Feny",
      firstOrderDivision: "AKUISISI",
      reviewReason: null,
      isNew: false,
      ...overrides,
    };
  }

  it("menghasilkan header + 1 baris per customer terpilih, nomor HP tetap teks utuh", () => {
    const csv = buildSelectedCustomersCsv([row()]);
    const lines = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("No HP");
    expect(lines[1]).toContain("6281234567890");
  });

  it("meng-escape tanda kutip ganda di dalam nilai (nama mengandung karakter \")", () => {
    const csv = buildSelectedCustomersCsv([row({ displayName: 'Toko "Ani" Jaya' })]);
    expect(csv).toContain('"Toko ""Ani"" Jaya"');
  });

  it("customer tanpa grup/PIC tampil sebagai — bukan kosong/undefined", () => {
    const csv = buildSelectedCustomersCsv([row({ groupName: null, picName: null })]);
    const dataLine = csv.split("\r\n")[1]!;
    expect(dataLine).toContain('"—"');
  });
});
