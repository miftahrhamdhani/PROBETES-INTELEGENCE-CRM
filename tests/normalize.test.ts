import { describe, expect, it } from "vitest";
import { normalizeAmount } from "@/server/normalize/amount";
import { normalizeDate } from "@/server/normalize/date";
import { normalizePhone } from "@/server/normalize/phone";
import { classifyProduct } from "@/server/normalize/product-catalog";
import { cleanText } from "@/server/normalize/text";

describe("normalizePhone", () => {
  it.each([
    ["0812 3456 7890", "6281234567890"],
    ["0812-3456-7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["81234567890", "6281234567890"],
    [6281234567890, "6281234567890"],
    ["6281234567890.0", "6281234567890"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ status: "VALID", normalized: expected });
  });

  it("scientific notation ditolak karena data sudah rusak", () => {
    expect(normalizePhone("8.12346E+11")).toMatchObject({ status: "INVALID" });
  });
});

describe("normalisasi dasar", () => {
  it("nbsp/spasi produk dinormalisasi", () => {
    expect(cleanText("  Ebook   90 ")).toBe("Ebook 90");
    expect(classifyProduct("Ebook 90").code).toBe("EBOOK");
  });

  it("alias produk resmi", () => {
    expect(classifyProduct("Tk Probetes Herbal 24").code).toBe("HERBAL_PROBETES");
    expect(classifyProduct("S Amandia 7").code).toBe("SEREAL_AMANDIA");
    expect(classifyProduct("Minyak Kelapa CCO").code).toBe("MINYAK_CCO");
    expect(classifyProduct("Bio Insuleaf").isKsbProduct).toBe(true);
  });

  it("amount menjadi bigint rupiah", () => {
    expect(normalizeAmount("Rp 1.500.000")).toBe(1_500_000n);
    expect(normalizeAmount("89,000")).toBe(89_000n);
    expect(normalizeAmount(445000.4)).toBe(445_000n);
  });

  it("tanggal DD/MM/YYYY dan Date lokal menjadi ISO tanpa bergeser", () => {
    expect(normalizeDate("26/07/2026")).toEqual({ status: "VALID", date: "2026-07-26" });
    expect(normalizeDate(new Date(2026, 6, 26))).toEqual({ status: "VALID", date: "2026-07-26" });
    expect(normalizeDate("31/02/2026")).toMatchObject({ status: "INVALID" });
  });
});
