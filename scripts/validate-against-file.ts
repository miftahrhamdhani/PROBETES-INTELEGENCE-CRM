import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { RULE_VERSION, type ClusterAssignmentCode } from "../src/lib/cluster-codes";
import { assignCluster } from "../src/server/cluster/engine";
import { buildCustomerFeatures } from "../src/server/cluster/features";
import type { ClusterContext, RawOrderInput } from "../src/server/cluster/types";
import { parseDatabaseAll } from "../src/server/import/database-all-parser";
import { parseGroupListRows } from "../src/server/import/group-list-parser";
import { parseKsbRows } from "../src/server/import/ksb-parser";
import type { SourceRow } from "../src/server/import/types";

const databaseAllPath =
  process.argv[2] ?? "C:/Users/Miftah Ramdhani/OneDrive/Dokumen/01. database All.xlsx";
const cohortPath =
  process.argv[3] ??
  "C:/Users/Miftah Ramdhani/OneDrive/Dokumen/[Web Based] COHORT ANALYSIS - ALL PRODUCT.xlsx";

const LEGACY_TARGET: Partial<Record<ClusterAssignmentCode, number>> = {
  A1: 209,
  A2: 1_215,
  A3: 445,
  A4: 322,
  B: 1_006,
  C_PRODIG: 1_259,
  C_HP: 32,
  C_F2: 65,
  D_NEW: 236,
  D_OLD: 4_569,
  DHP_NEW: 160,
  DHP_OLD: 281,
  E: 4_980,
  F: 847,
};

const DISPLAY_ORDER: ClusterAssignmentCode[] = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B",
  "C_PRODIG",
  "C_HP",
  "C_F2",
  "D_NEW",
  "D_OLD",
  "DHP_NEW",
  "DHP_OLD",
  "E",
  "F",
  "NEEDS_REVIEW",
  "YACONA_NON_COHORT",
];

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): SourceRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet '${sheetName}' tidak ditemukan`);
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  return values.map((row, index) => ({ rowNumber: index + 2, values: row }));
}

function toRawOrder(order: ReturnType<typeof parseDatabaseAll>["orders"][number]): RawOrderInput {
  return {
    date: order.orderDate,
    items: order.items.map((item) => ({
      amount: item.amount,
      isBonus: item.isBonus,
      productFlags: item.productFlags,
    })),
  };
}

function percentage(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`;
}

console.log("Membaca workbook produksi...");
const databaseWorkbook = XLSX.read(readFileSync(databaseAllPath), {
  type: "buffer",
  cellDates: true,
});
const cohortWorkbook = XLSX.read(readFileSync(cohortPath), {
  type: "buffer",
  cellDates: true,
});

const databaseRows = sheetRows(databaseWorkbook, "allbaru");
const database = parseDatabaseAll(databaseRows);
const ksb = parseKsbRows(sheetRows(cohortWorkbook, "DataKSB"));
const masukWa = parseGroupListRows(sheetRows(cohortWorkbook, "masukWA"), "masukWA");
const backup = parseGroupListRows(
  sheetRows(cohortWorkbook, "BackupMasukGrup"),
  "BackupMasukGrup"
);

if (!database.asOfDate) throw new Error("as_of_date tidak ditemukan dari Database All");
const context: ClusterContext = { asOfDate: database.asOfDate, ruleVersion: RULE_VERSION };

const groupPhones = new Set([
  ...masukWa.entries.map((entry) => entry.normalizedPhone),
  ...backup.entries.map((entry) => entry.normalizedPhone),
]);

const ordersByPhone = new Map<string, RawOrderInput[]>();
for (const order of database.orders) {
  const orders = ordersByPhone.get(order.normalizedPhone) ?? [];
  orders.push(toRawOrder(order));
  ordersByPhone.set(order.normalizedPhone, orders);
}

const ksbDatesByPhone = new Map<string, Set<string>>();
for (const transaction of ksb.transactions) {
  const dates = ksbDatesByPhone.get(transaction.normalizedPhone) ?? new Set<string>();
  dates.add(transaction.transactionDate);
  ksbDatesByPhone.set(transaction.normalizedPhone, dates);
}

const customerPhones = new Set([...ordersByPhone.keys(), ...ksbDatesByPhone.keys()]);
const assignments = new Map<ClusterAssignmentCode, string[]>();
for (const phone of customerPhones) {
  const orders = ordersByPhone.get(phone) ?? [];
  const yaconaFrequency = ksbDatesByPhone.get(phone)?.size ?? 0;
  const hasGroup = groupPhones.has(phone) ? "GROUPED" : "NOT_GROUPED";
  const features = buildCustomerFeatures(orders, hasGroup, yaconaFrequency, context);
  const assignment = assignCluster(features, context);
  const phones = assignments.get(assignment.clusterCode) ?? [];
  phones.push(phone);
  assignments.set(assignment.clusterCode, phones);
}

const officialTotal = DISPLAY_ORDER.slice(0, 14).reduce(
  (sum, code) => sum + (assignments.get(code)?.length ?? 0),
  0
);
const targetTotal = Object.values(LEGACY_TARGET).reduce((sum, value) => sum + (value ?? 0), 0);

console.log("\n=== INPUT ===");
console.log(`Database All rows       : ${database.totalSourceRows.toLocaleString("id-ID")}`);
console.log(`Canonical daily orders : ${database.orders.length.toLocaleString("id-ID")}`);
console.log(`Excluded rows           : ${database.excluded.length.toLocaleString("id-ID")}`);
console.log(`DataKSB transactions    : ${ksb.transactions.length.toLocaleString("id-ID")}`);
console.log(`Group phones            : ${groupPhones.size.toLocaleString("id-ID")}`);
console.log(`Customer universe       : ${customerPhones.size.toLocaleString("id-ID")}`);
console.log(`as_of_date              : ${context.asOfDate}`);

console.log("\n=== REKONSILIASI CLUSTER ===");
console.log("Cluster       New       Legacy     Selisih");
console.log("--------------------------------------------");
let totalAbsoluteDelta = 0;
for (const code of DISPLAY_ORDER) {
  const actual = assignments.get(code)?.length ?? 0;
  const target = LEGACY_TARGET[code];
  const delta = target === undefined ? null : actual - target;
  if (delta !== null) totalAbsoluteDelta += Math.abs(delta);
  console.log(
    `${code.padEnd(12)}${String(actual).padStart(8)}${
      target === undefined ? "       -" : String(target).padStart(12)
    }${delta === null ? "          -" : String(delta >= 0 ? `+${delta}` : delta).padStart(12)}`
  );
}
console.log("--------------------------------------------");
console.log(`Official total : ${officialTotal.toLocaleString("id-ID")}`);
console.log(`Legacy total   : ${targetTotal.toLocaleString("id-ID")}`);
console.log(`|Δ| total      : ${totalAbsoluteDelta.toLocaleString("id-ID")}`);
console.log(`Coverage       : ${percentage(officialTotal, customerPhones.size)}`);

const unknownItemCount = database.orders.reduce(
  (sum, order) =>
    sum + order.items.filter((item) => item.productFlags.code === "UNKNOWN").length,
  0
);
console.log("\n=== DATA QUALITY ===");
console.log(`Unknown product items   : ${unknownItemCount.toLocaleString("id-ID")}`);
console.log(
  `Needs review customers : ${(assignments.get("NEEDS_REVIEW")?.length ?? 0).toLocaleString("id-ID")}`
);
console.log(
  `KSB non-cohort         : ${(assignments.get("YACONA_NON_COHORT")?.length ?? 0).toLocaleString("id-ID")}`
);

console.log("\nValidator selesai. Selisih rinci disimpan sebagai baseline di docs/08-RECONCILIATION.md.");
