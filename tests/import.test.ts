import { describe, expect, it } from "vitest";
import { assertDatabaseAllColumns, parseDatabaseAll } from "@/server/import/database-all-parser";
import { parseGroupListRows } from "@/server/import/group-list-parser";
import { parseKsbRows } from "@/server/import/ksb-parser";
import { sourceValue } from "@/server/import/source-row";
import type { SourceRow } from "@/server/import/types";

function row(rowNumber: number, values: Record<string, unknown>): SourceRow {
  return { rowNumber, values };
}

const BASE = {
  "Customer": "Ibu Ani",
  "No. HP": "0812 3456 7890",
  "CS": "Feni ",
  "DIVISI": " CRM ",
  "Platform": "Meta",
  "pembayaran ": "TRANSFER",
  "Mitra": "UP DM",
  "Memo": "RO",
};

describe("Database All parser", () => {
  it("satu customer + satu tanggal = satu order walau idpesan berbeda", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "ORDER-A",
      }),
      row(3, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Probetes Herbal 24",
        "Qty 1": 1,
        "Nilai Produk": 445_000,
        idpesan: "ORDER-B",
      }),
    ]);

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.sourceOrderKey).toBe("2026-01-05|6281234567890");
    expect(result.orders[0]?.items).toHaveLength(2);
    expect(result.orders[0]?.orderTotal).toBe(534_000n);
  });

  it("upload file sama dua kali menghasilkan source key identik (idempoten)", () => {
    const rows = [
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "ORDER-A",
      }),
    ];

    const first = parseDatabaseAll(rows);
    const second = parseDatabaseAll(rows);
    expect(second).toEqual(first);
    expect(first.orders[0]?.items[0]?.sourceItemKey).toBe(
      second.orders[0]?.items[0]?.sourceItemKey
    );
  });

  it("Yacona/KSB di Database All dikeluarkan dari order Probetes", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Yacona 60",
        "Qty 1": 1,
        "Nilai Produk": 180_000,
        idpesan: "Y-1",
      }),
      row(3, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "P-1",
      }),
    ]);

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.items).toHaveLength(1);
    expect(result.orders[0]?.items[0]?.productFlags.code).toBe("EBOOK");
    expect(result.orders[0]?.orderTotal).toBe(89_000n);
  });

  it("Yacona/KSB di Database All ditangkap ke ksbTransactions, bukan dibuang total", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Yacona 60",
        "Qty 1": 1,
        "Nilai Produk": 180_000,
        idpesan: "Y-1",
      }),
    ]);

    expect(result.ksbTransactions).toHaveLength(1);
    expect(result.ksbTransactions[0]?.productCode).toBe("YACONA");
    expect(result.ksbTransactions[0]?.normalizedPhone).toBe("6281234567890");
    expect(result.ksbTransactions[0]?.transactionDate).toBe("2026-01-05");
    expect(result.ksbTransactions[0]?.amount).toBe(180_000n);
  });

  it("no phone -> excluded, bukan customer/order", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "No. HP": "",
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Ebook 90",
        "Nilai Produk": 89_000,
      }),
    ]);
    expect(result.orders).toHaveLength(0);
    expect(result.excluded[0]?.codes).toContain("MISSING_PHONE");
  });

  it("unknown product tidak menggagalkan import", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "PRODUK PROMO BARU",
        "Nilai Produk": 99_000,
        idpesan: "X-1",
      }),
    ]);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.items[0]?.productFlags.code).toBe("UNKNOWN");
  });

  // Export CSV "database update juli.csv" (master order tracking, bukan sheet
  // "allbaru") pakai "Tanggal" untuk kolom yang sama secara semantik dengan
  // "Tanggal Pesanan" — lihat COLUMN_ALIASES di source-row.ts.
  it("kolom 'Tanggal' diterima sebagai alias 'Tanggal Pesanan' (varian export CSV)", () => {
    expect(() => assertDatabaseAllColumns(["Tanggal", "Customer", "No. HP", "Produk 1", "Nilai Produk"])).not.toThrow();

    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        Tanggal: "05/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "ORDER-ALIAS",
      }),
    ]);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.orderDate).toBe("2026-01-05");
  });

  it("assertDatabaseAllColumns tetap menolak kalau 'Tanggal Pesanan' maupun alias 'Tanggal' tidak ada", () => {
    expect(() => assertDatabaseAllColumns(["Customer", "No. HP", "Produk 1", "Nilai Produk"])).toThrow(
      /Tanggal Pesanan/
    );
  });

  it("sourceValue tidak salah ambil kolom tanggal lain yang mirip (rekonsiliasi/status penerimaan)", () => {
    const r = row(2, {
      "Tanggal rekonsiliasi": "01/02/2026",
      Tgl_Status_Penerimaan: "03/02/2026",
      Tanggal: "05/01/2026",
    });
    expect(sourceValue(r, "Tanggal Pesanan")).toBe("05/01/2026");
  });
});

describe("KSB parser", () => {
  it("dedup row identik; frequency nanti dihitung distinct tanggal", () => {
    const data = row(2, {
      "Tanggal Transaksi": "01/07/2026",
      "User ID": 6281234567890,
      "Nama Produk": "Yacona 60",
      "Qty": 1,
      "Total Harga": "180,000",
      "NamaCustomer": "Ibu Ani",
    });
    const result = parseKsbRows([data, { ...data, rowNumber: 3 }]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(180_000n);
    expect(result.transactions[0]?.productCode).toBe("YACONA");
  });

  it("baris product_family bukan KSB (mis. PBH 70) di-skip, tercatat sebagai audit trail", () => {
    const result = parseKsbRows([
      row(2, {
        "Tanggal Transaksi": "01/07/2026",
        "User ID": 6281234567890,
        "Nama Produk": "PBH 70",
        "Qty": 1,
        "Total Harga": "70,000",
        "NamaCustomer": "Ibu Ani",
      }),
    ]);
    expect(result.transactions).toHaveLength(0);
    expect(result.skippedNonKsb).toHaveLength(1);
    expect(result.skippedNonKsb[0]?.productCode).toBe("HERBAL_PROBETES");
  });

  it("header 'Total Harga' dengan spasi (varian export) tetap terbaca, bukan jadi 0", () => {
    const result = parseKsbRows([
      row(2, {
        "Tanggal Transaksi": "01/07/2026",
        "User ID": 6281234567890,
        "Nama Produk": "Yacona 60",
        "Qty": 1,
        " Total Harga ": " Rp249,000 ",
        "NamaCustomer": "Ibu Ani",
      }),
    ]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(249_000n);
  });

  it("source key sama dari Legacy KSB dan Database All -> dedup lintas sumber (idempoten)", () => {
    const legacy = parseKsbRows([
      row(2, {
        "Tanggal Transaksi": "05/01/2026",
        "User ID": 6281234567890,
        "Nama Produk": "Yacona 60",
        "Qty": 1,
        "Total Harga": "180,000",
        "NamaCustomer": "Ibu Ani",
      }),
    ]);
    const dbAll = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Yacona 60",
        "Qty 1": 1,
        "Nilai Produk": 180_000,
        idpesan: "Y-1",
      }),
    ]);
    expect(dbAll.ksbTransactions[0]?.sourceKey).toBe(legacy.transactions[0]?.sourceKey);
  });
});

describe("Group list parser", () => {
  it("normalisasi dan dedup nomor", () => {
    const result = parseGroupListRows(
      [
        row(2, { "No HP": "0812 3456 7890", Nama: "Ani" }),
        row(3, { "No HP": "+62 812-3456-7890", Nama: "Ibu Ani" }),
      ],
      "masukWA"
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.normalizedPhone).toBe("6281234567890");
    expect(result.entries[0]?.sourceList).toBe("masukWA");
  });
});

/**
 * as_of_date WAJIB berasal dari order Probetes final, bukan dari seluruh baris
 * valid. Kalau baris KSB ikut memajukan as_of, recency_days/customer_age_days
 * (dan lewat itu D-New/D-Old, Dhp-New/Dhp-Old) bergeser, sementara seluruh query
 * analytics tetap memakai MAX(orders.order_date) yang isinya Probetes saja.
 * Lihat docs/02-CLUSTER-RULES.md §3.3.
 */
describe("as_of_date Probetes-only", () => {
  it("transaksi Probetes terakhir 1 Agu + transaksi KSB 5 Agu -> as_of tetap 1 Agu", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "01/08/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "PROBETES-TERAKHIR",
      }),
      row(3, {
        ...BASE,
        "No. HP": "0813 1111 2222",
        "Tanggal Pesanan": "05/08/2026",
        "Produk 1": "Yacona 60",
        "Qty 1": 1,
        "Nilai Produk": 300_000,
        idpesan: "KSB-LEBIH-BARU",
      }),
    ]);

    expect(result.asOfDate).toBe("2026-08-01");
    expect(result.ksbTransactions).toHaveLength(1);
    expect(result.ksbTransactions[0]?.transactionDate).toBe("2026-08-05");
    // Order Probetes tidak ikut terbawa tanggal KSB.
    expect(result.orders.map((o) => o.orderDate)).toEqual(["2026-08-01"]);
  });

  it("order campuran Probetes+KSB di hari yang sama tetap menghitung hari itu", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "10/08/2026",
        "Produk 1": "Ebook 90",
        "Nilai Produk": 89_000,
        idpesan: "MIX-1",
      }),
      row(3, {
        ...BASE,
        "Tanggal Pesanan": "10/08/2026",
        "Produk 1": "Yacona 60",
        "Nilai Produk": 300_000,
        idpesan: "MIX-1",
      }),
    ]);

    expect(result.asOfDate).toBe("2026-08-10");
    // Item KSB dikeluarkan dari order Probetes, tapi harinya tetap sah.
    expect(result.orders[0]?.items).toHaveLength(1);
    expect(result.orders[0]?.orderTotal).toBe(89_000n);
  });

  it("file yang isinya HANYA KSB -> as_of null (commit menolak mengaktifkan)", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "20/08/2026",
        "Produk 1": "Yacona 60",
        "Nilai Produk": 300_000,
        idpesan: "KSB-ONLY",
      }),
    ]);

    expect(result.orders).toHaveLength(0);
    expect(result.asOfDate).toBeNull();
    expect(result.ksbTransactions).toHaveLength(1);
  });

  it("baris excluded tidak pernah memajukan as_of", () => {
    const result = parseDatabaseAll([
      row(2, {
        ...BASE,
        "Tanggal Pesanan": "01/08/2026",
        "Produk 1": "Ebook 90",
        "Nilai Produk": 89_000,
        idpesan: "VALID",
      }),
      row(3, {
        ...BASE,
        "No. HP": "",
        "Tanggal Pesanan": "31/12/2026",
        "Produk 1": "Ebook 90",
        "Nilai Produk": 89_000,
        idpesan: "TANPA-HP",
      }),
    ]);

    expect(result.asOfDate).toBe("2026-08-01");
    expect(result.excluded).toHaveLength(1);
  });
});
