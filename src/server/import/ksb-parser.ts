import { normalizeAmount } from "../normalize/amount";
import { normalizeDate } from "../normalize/date";
import { normalizePhone } from "../normalize/phone";
import { classifyProduct, type CanonicalProductCode } from "../normalize/product-catalog";
import { cleanText } from "../normalize/text";
import { sourceValue as value } from "./source-row";
import type { ExcludedRow, NormalizedKsbTransaction, SourceRow, ValidationCode } from "./types";

export interface SkippedNonKsbRow {
  rowNumber: number;
  rawProductName: string;
  productCode: CanonicalProductCode;
}

export interface KsbParseResult {
  transactions: NormalizedKsbTransaction[];
  excluded: ExcludedRow[];
  /** Baris valid (phone/tanggal OK) tapi product_family-nya BUKAN KSB menurut
   *  Product Catalog (mis. PBH 70 -> HERBAL_PROBETES) — Product Catalog adalah
   *  source of truth, bukan file asal. Tidak masuk transactions; dicatat untuk
   *  audit trail (SKIPPED_NON_KSB_FROM_LEGACY), bukan dihilangkan diam-diam. */
  skippedNonKsb: SkippedNonKsbRow[];
  totalSourceRows: number;
}

/** Content-based, BUKAN row number/batch — supaya transaksi yang sama dari
 *  Legacy KSB maupun ekstraksi Database All otomatis dedup lewat unique index
 *  ksb_transactions_source_key_uq (fallback matching: phone+tanggal+produk
 *  canonical+qty+amount, karena Legacy KSB tidak punya order/external ID). */
export function buildKsbTransactionKey(input: {
  normalizedPhone: string;
  transactionDate: string;
  productCode: CanonicalProductCode;
  qty: string | null;
  amount: bigint;
}): string {
  return [
    input.normalizedPhone,
    input.transactionDate,
    input.productCode,
    input.qty ?? "",
    input.amount.toString(),
  ].join("|");
}

/** Parser sheet DataKSB/format Setup Data: tanggal=col D, phone=User ID, dst. */
export function parseKsbRows(rows: SourceRow[]): KsbParseResult {
  const transactions = new Map<string, NormalizedKsbTransaction>();
  const excluded: ExcludedRow[] = [];
  const skippedNonKsb: SkippedNonKsbRow[] = [];

  for (const row of rows) {
    const codes: ValidationCode[] = [];
    const phone = normalizePhone(value(row, "User ID"));
    const dateResult = normalizeDate(value(row, "Tanggal Transaksi"));
    const customerName = cleanText(value(row, "NamaCustomer"));
    if (phone.status === "MISSING") codes.push("MISSING_PHONE");
    else if (phone.status === "INVALID") codes.push("INVALID_PHONE");
    if (dateResult.status !== "VALID") codes.push("INVALID_DATE");
    // Sama dengan database-all-parser.ts — nama kosong = IMPORT EXCLUSION
    // (docs/07-OPEN-QUESTIONS.md "Populasi CRM final").
    if (!customerName) codes.push("MISSING_NAME");

    if (codes.length || phone.status !== "VALID" || dateResult.status !== "VALID" || !customerName) {
      excluded.push({ rowNumber: row.rowNumber, codes, raw: row.values });
      continue;
    }

    const rawProductName = cleanText(value(row, "Nama Produk"));
    const productFlags = classifyProduct(rawProductName);

    if (!productFlags.isKsbProduct) {
      skippedNonKsb.push({
        rowNumber: row.rowNumber,
        rawProductName,
        productCode: productFlags.code,
      });
      continue;
    }

    const amount = normalizeAmount(value(row, "Total Harga"));
    const qtyRaw = value(row, "Qty");
    const qty = qtyRaw === null || qtyRaw === undefined || qtyRaw === "" ? null : cleanText(qtyRaw);

    const sourceKey = buildKsbTransactionKey({
      normalizedPhone: phone.normalized,
      transactionDate: dateResult.date,
      productCode: productFlags.code,
      qty,
      amount,
    });

    transactions.set(sourceKey, {
      sourceKey,
      normalizedPhone: phone.normalized,
      customerName,
      transactionDate: dateResult.date,
      productName: rawProductName,
      productCode: productFlags.code,
      qty,
      amount,
      sourceRowNumber: row.rowNumber,
    });
  }

  return {
    transactions: [...transactions.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    excluded,
    skippedNonKsb,
    totalSourceRows: rows.length,
  };
}
