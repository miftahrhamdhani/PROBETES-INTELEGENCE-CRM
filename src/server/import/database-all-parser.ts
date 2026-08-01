import { normalizeAmount } from "../normalize/amount";
import { normalizeDate } from "../normalize/date";
import { normalizePhone } from "../normalize/phone";
import { classifyProduct } from "../normalize/product-catalog";
import { cleanText, normalizeForMatching } from "../normalize/text";
import { buildKsbTransactionKey } from "./ksb-parser";
import { sourceValue as value } from "./source-row";
import type {
  DatabaseAllParseResult,
  ExcludedRow,
  NormalizedDailyOrder,
  NormalizedKsbTransaction,
  NormalizedOrderItem,
  SourceRow,
  ValidationCode,
} from "./types";

export const DATABASE_ALL_REQUIRED_COLUMNS = [
  "Tanggal Pesanan",
  "Customer",
  "No. HP",
  "Produk 1",
  "Nilai Produk",
] as const;

export function assertDatabaseAllColumns(headers: string[]): void {
  const normalized = new Set(headers.map((h) => h.trim()));
  const missing = DATABASE_ALL_REQUIRED_COLUMNS.filter((h) => !normalized.has(h));
  if (missing.length) throw new Error(`Kolom wajib Database All tidak ditemukan: ${missing.join(", ")}`);
}

/**
 * Parser murni: raw rows → order harian. Tidak menyentuh DB.
 * Satu customer + satu tanggal = satu order; semua idpesan di hari itu jadi items.
 */
export function parseDatabaseAll(rows: SourceRow[]): DatabaseAllParseResult {
  const grouped = new Map<string, NormalizedDailyOrder>();
  const ksbTransactions = new Map<string, NormalizedKsbTransaction>();
  const excluded: ExcludedRow[] = [];
  let asOfDate: string | null = null;

  for (const row of rows) {
    const codes: ValidationCode[] = [];
    const phone = normalizePhone(value(row, "No. HP"));
    const dateResult = normalizeDate(value(row, "Tanggal Pesanan"));
    const customerName = cleanText(value(row, "Customer"));

    if (phone.status === "MISSING") codes.push("MISSING_PHONE");
    else if (phone.status === "INVALID") codes.push("INVALID_PHONE");
    if (dateResult.status !== "VALID") codes.push("INVALID_DATE");
    // Populasi CRM final (docs/07-OPEN-QUESTIONS.md): nama kosong = IMPORT
    // EXCLUSION, sejajar dengan phone/tanggal — baris ini tidak pernah boleh
    // jadi canonical customer/order, hanya tersimpan di staging untuk audit.
    if (!customerName) codes.push("MISSING_NAME");

    if (codes.length || phone.status !== "VALID" || dateResult.status !== "VALID" || !customerName) {
      excluded.push({ rowNumber: row.rowNumber, codes, raw: row.values });
      continue;
    }

    const rawProductName = cleanText(value(row, "Produk 1"));
    const productFlags = classifyProduct(rawProductName);
    if (productFlags.code === "UNKNOWN") codes.push("UNKNOWN_PRODUCT");

    const externalId = cleanText(value(row, "idpesan")) || null;
    if (!externalId) codes.push("MISSING_ORDER_ID");

    const amount = normalizeAmount(value(row, "Nilai Produk"));
    const qtyRaw = value(row, "Qty 1");
    const qty = qtyRaw === null || qtyRaw === undefined || qtyRaw === "" ? null : cleanText(qtyRaw);
    const isBonus = /BONUS/i.test(rawProductName) && amount === 0n;
    const sourceOrderKey = `${dateResult.date}|${phone.normalized}`;

    // Item product_family=KSB nyasar di Database All (docs/02-CLUSTER-RULES.md
    // §3.1) — dikeluarkan dari order Probetes di bawah, tapi DITANGKAP di sini
    // supaya ikut ksb_transactions/Cluster B, bukan hilang total.
    if (productFlags.isKsbProduct) {
      const ksbKey = buildKsbTransactionKey({
        normalizedPhone: phone.normalized,
        transactionDate: dateResult.date,
        productCode: productFlags.code,
        qty,
        amount,
      });
      ksbTransactions.set(ksbKey, {
        sourceKey: ksbKey,
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

    const sourceItemKey = [
      sourceOrderKey,
      externalId ?? "NO_ID",
      normalizeForMatching(rawProductName),
      qty ?? "",
      amount.toString(),
    ].join("|");

    const item: NormalizedOrderItem = {
      sourceItemKey,
      sourceRowNumber: row.rowNumber,
      externalId,
      rawProductName,
      productFlags,
      qty,
      amount,
      isBonus,
      identityConfidence: externalId ? "HIGH" : "LOW",
    };

    const current = grouped.get(sourceOrderKey);
    if (current) {
      current.items.push(item);
      current.orderTotal += productFlags.isKsbProduct ? 0n : amount;
    } else {
      grouped.set(sourceOrderKey, {
        sourceOrderKey,
        normalizedPhone: phone.normalized,
        displayPhone: cleanText(value(row, "No. HP")),
        customerName,
        orderDate: dateResult.date,
        orderTotal: productFlags.isKsbProduct ? 0n : amount,
        platform: normalizeForMatching(value(row, "Platform")),
        division: normalizeForMatching(value(row, "DIVISI")),
        paymentMethod: normalizeForMatching(value(row, "pembayaran")),
        partner: normalizeForMatching(value(row, "Mitra")),
        csName: normalizeForMatching(value(row, "CS")),
        memo: normalizeForMatching(value(row, "Memo")),
        items: [item],
      });
    }

    if (asOfDate === null || dateResult.date > asOfDate) asOfDate = dateResult.date;

    // UNKNOWN/MISSING_ORDER_ID bukan excluded — import tetap lanjut. Issue dicatat
    // oleh orchestrator ke data_quality_issues berdasarkan data item ini.
  }

  // KSB/Yacona tidak boleh masuk canonical orders/order_items Probetes.
  // Raw-nya tetap aman di staging_import_rows untuk audit, dan sudah ditangkap
  // ke ksbTransactions di atas.
  const orders = [...grouped.values()]
    .map((o) => ({ ...o, items: o.items.filter((i) => !i.productFlags.isKsbProduct) }))
    .filter((o) => o.items.length > 0)
    .sort((a, b) => a.sourceOrderKey.localeCompare(b.sourceOrderKey));

  return {
    orders,
    ksbTransactions: [...ksbTransactions.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    excluded,
    asOfDate,
    totalSourceRows: rows.length,
  };
}
