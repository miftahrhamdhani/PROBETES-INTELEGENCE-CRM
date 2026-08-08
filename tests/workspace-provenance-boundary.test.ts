import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresi DATA LEAK: Database All bukan Workspace Pesanan.
 *
 * Bug-nya berlapis dua:
 *  1. SISI TULIS — commitDatabaseAllImport() memanggil
 *     ingestWorkspaceOrdersFromImport(), jadi setiap commit Database All
 *     membuat workspace_orders (source_type='DATABASE_ALL') + item-nya. Retry
 *     produk tak dikenal memakai writer yang sama sebagai pintu belakang kedua.
 *  2. SISI BACA — seluruh read-model Workspace memfilter generation dan soft
 *     delete, tapi TIDAK memfilter provenance. Baris DATABASE_ALL karena itu
 *     muncul di Pesanan, KPI, Overview (gross/COS/AOV/trend/top produk/sumber/
 *     pembayaran/status/pesanan terbaru), detail, dan export.
 *
 * Database All adalah domain Analysis/Customer Intelligence. Provenance
 * Workspace yang sah HANYA `source_type = 'MANUAL'` (form Input Pesanan).
 * Bukan `sales_source` (itu sumber penjualan bisnis) dan bukan
 * `workspace_generation` (DATABASE_ALL dan MANUAL bisa satu generation).
 *
 * Baris DATABASE_ALL yang terlanjur bocor SENGAJA tetap di database untuk
 * audit — test ini menuntut ia tidak terbaca, bukan dihapus.
 */

const executed: string[] = [];
let rowsFor: (sqlText: string) => Record<string, unknown>[] = () => [];

/** Rangkai ulang SQL drizzle (chunk + param) jadi teks yang bisa diperiksa. */
function renderSql(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(renderSql).join(" ");
  const record = node as Record<string, unknown>;
  if (typeof record.value === "string") return record.value;
  if (Array.isArray(record.value)) return record.value.map(renderSql).join(" ");
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(renderSql).join(" ");
  return "";
}

vi.mock("@/server/db/client", () => ({
  getDb: () => ({
    execute: async (query: unknown) => {
      const text = renderSql(query);
      executed.push(text);
      return { rows: rowsFor(text) };
    },
  }),
}));

const overview = await import("@/server/workspace/pesanan-overview");
const pesanan = await import("@/server/workspace/pesanan");
const { toWorkspacePesananCsv, toWorkspacePesananExportRows, toWorkspacePesananXlsxBuffer } = await import(
  "@/server/workspace/pesanan-export"
);
const { WORKSPACE_ORDER_SOURCE_TYPE, workspaceManualOrderScope } = await import("@/server/workspace/provenance");

const RANGE = { from: "2026-01-01", to: "2026-12-31" };
const LIST_FILTER = { page: 1, perPage: 50 };

function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

/**
 * Sumber TANPA komentar. Batas domain ini justru banyak dijelaskan di komentar
 * ("jangan panggil ingestWorkspaceOrdersFromImport lagi"), jadi assertion
 * "tidak boleh menyebut X" harus melihat KODE-nya saja — kalau tidak, komentar
 * yang benar malah menggagalkan test.
 */
function codeOf(relativePath: string): string {
  return sourceOf(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

beforeEach(() => {
  executed.length = 0;
  rowsFor = () => [];
});

/**
 * Setiap SQL yang menyentuh workspace_orders WAJIB memfilter provenance.
 * Ditulis sebagai sweep (bukan assert per-query) supaya query baru yang lupa
 * memakai predicate ikut ketahuan tanpa test baru.
 */
function expectProvenanceFilteredEverywhere() {
  const touching = executed.filter((text) => text.includes("workspace_orders"));
  expect(touching.length, "tidak ada query workspace_orders yang tertangkap").toBeGreaterThan(0);
  for (const text of touching) {
    expect(text, `query tanpa filter provenance:\n${text}`).toContain("source_type");
    expect(text, `query tanpa nilai provenance MANUAL:\n${text}`).toContain(WORKSPACE_ORDER_SOURCE_TYPE);
    // Provenance TIDAK boleh diturunkan dari sales_source (sumber penjualan bisnis).
    expect(text, `provenance salah kolom (sales_source):\n${text}`).not.toContain("sales_source = ");
  }
}

describe("predicate provenance terpusat", () => {
  it("satu sumber canonical, bukan string literal tersebar", () => {
    expect(WORKSPACE_ORDER_SOURCE_TYPE).toBe("MANUAL");
    expect(renderSql(workspaceManualOrderScope("o"))).toContain("o.source_type");
    expect(renderSql(workspaceManualOrderScope("o"))).toContain("MANUAL");
    expect(renderSql(workspaceManualOrderScope(""))).toContain("source_type");
  });

  it("provenance BUKAN workspace_generation — DATABASE_ALL dan MANUAL bisa satu angkatan", () => {
    const provenance = sourceOf("src/server/workspace/provenance.ts");
    expect(provenance).not.toContain("CRM_FRESH_V1");
  });
});

describe("SISI TULIS — Database All tidak pernah membuat order Workspace", () => {
  const orchestrator = codeOf("src/server/import/orchestrator.ts");
  const retry = codeOf("src/server/workspace/unmapped-retry.ts");

  it("commit Database All tidak memanggil ingest Workspace (tidak menambah workspace_orders)", () => {
    expect(orchestrator).not.toContain("ingestWorkspaceOrdersFromImport");
    expect(orchestrator).not.toContain("workspace_orders");
  });

  it("commit Database All tidak menulis workspace_order_items", () => {
    expect(orchestrator).not.toContain("workspace_order_items");
  });

  it("retry produk tak dikenal (legacy) tidak memanggil writer Workspace", () => {
    expect(retry).not.toContain("ingestWorkspaceOrdersFromImport");
    expect(retry).not.toContain("workspace_orders");
    expect(retry).not.toContain("workspace_order_items");
  });

  it("TIDAK ADA modul produksi yang meng-import writer DATABASE_ALL yang sudah dinonaktifkan", () => {
    const importers = [
      "src/server/import/orchestrator.ts",
      "src/server/workspace/unmapped-retry.ts",
      "src/server/workspace/data-quality.ts",
      "src/server/workspace/pesanan.ts",
      "src/server/workspace/pesanan-overview.ts",
    ];
    for (const file of importers) {
      expect(codeOf(file), `${file} masih meng-import writer Workspace dari Database All`).not.toContain(
        "@/server/workspace/pesanan-import"
      );
    }
  });
});

describe("SISI BACA — Pesanan, KPI, detail, export", () => {
  it("daftar Pesanan DAN count-nya membuang DATABASE_ALL", async () => {
    await pesanan.listWorkspaceOrders(LIST_FILTER as never);
    // Dua query: baris + count. Count yang tidak terfilter membuat pagination
    // menghitung baris yang tidak pernah ditampilkan.
    expect(executed.filter((t) => t.includes("workspace_orders")).length).toBe(2);
    expectProvenanceFilteredEverywhere();
  });

  it.each(["draft", "semua", "retur_refund"] as const)("tab %s tetap membuang DATABASE_ALL", async (tab) => {
    await pesanan.listWorkspaceOrders({ ...LIST_FILTER, tab } as never);
    expectProvenanceFilteredEverywhere();
  });

  it("filter tanggal/customer/CRM/status tetap bekerja DI ATAS provenance", async () => {
    await pesanan.listWorkspaceOrders({
      page: 2,
      perPage: 25,
      from: "2026-08-01",
      to: "2026-08-31",
      customer: "Budi",
      crmUserId: 9,
      status: "CONFIRMED",
      tab: "semua",
    } as never);
    const rowsQuery = executed.find((t) => t.includes("workspace_orders") && t.includes("GROUP BY"))!;
    expect(rowsQuery).toContain("source_type");
    expect(rowsQuery).toContain("o.order_date >=");
    expect(rowsQuery).toContain("o.customer_name ILIKE");
    expect(rowsQuery).toContain("o.crm_user_id =");
    expect(rowsQuery).toContain("o.status =");
    expectProvenanceFilteredEverywhere();
  });

  it("KPI Pesanan tidak menghitung DATABASE_ALL", async () => {
    await pesanan.getWorkspacePesananKpi(LIST_FILTER as never);
    expectProvenanceFilteredEverywhere();
  });

  it("detail order menolak membuka baris DATABASE_ALL (null = tidak ditemukan)", async () => {
    // Row DATABASE_ALL tetap ADA di database, tapi query detail tidak memilihnya.
    rowsFor = () => [];
    const detail = await pesanan.getWorkspaceOrder(84);
    expect(detail).toBeNull();
    expectProvenanceFilteredEverywhere();
  });

  it("mutasi (confirm/cancel/retur/refund/hapus) juga tidak bisa menyentuh DATABASE_ALL", () => {
    // loadOrderForUpdate() adalah gerbang tunggal seluruh fungsi mutasi.
    const code = codeOf("src/server/workspace/pesanan.ts");
    const gate = code.slice(code.indexOf("async function loadOrderForUpdate"), code.indexOf("export async function updateWorkspaceOrder"));
    expect(gate).toContain("source_type = $2");
    expect(gate).toContain("WORKSPACE_ORDER_SOURCE_TYPE");
  });
});

describe("SISI BACA — Overview", () => {
  it("KPI Overview (jumlah customer/gross/COS/AOV/net) membuang DATABASE_ALL", async () => {
    await overview.getOverviewKpi(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("refund PARTIALLY_REFUNDED membuang DATABASE_ALL", async () => {
    await overview.refundDeductionForPeriod(RANGE.from, RANGE.to);
    expectProvenanceFilteredEverywhere();
  });

  it.each(["daily", "weekly", "monthly"] as const)("trend %s membuang DATABASE_ALL", async (granularity) => {
    await overview.getRevenueOrderTrend(RANGE, granularity);
    expectProvenanceFilteredEverywhere();
  });

  it("top produk (quantity/revenue/COS) membuang DATABASE_ALL", async () => {
    await overview.getTopProductsByQuantity(RANGE);
    await overview.getTopProductsByRevenue(RANGE);
    await overview.getTopProductsByCos(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("penjualan berdasarkan sumber membuang DATABASE_ALL", async () => {
    await overview.getSalesBySource(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("metode pembayaran membuang DATABASE_ALL", async () => {
    await overview.getPaymentComposition(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("status pesanan membuang DATABASE_ALL", async () => {
    await overview.getStatusComposition(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("pesanan terbaru membuang DATABASE_ALL", async () => {
    await overview.getLatestOrders(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("ringkasan customer membuang DATABASE_ALL", async () => {
    await overview.getCustomerSummary(RANGE);
    expectProvenanceFilteredEverywhere();
  });

  it("COM tetap dari workspace_operational_costs — tidak terkait source_type order", () => {
    const source = sourceOf("src/server/workspace/pesanan-overview.ts");
    const com = source.slice(source.indexOf("export async function getComComposition"), source.indexOf("export type LatestOrderRow"));
    expect(com).toContain("workspace_operational_costs");
    expect(com).toContain("c.status = 'DIRECTOR_APPROVED'");
    expect(com).not.toContain("source_type");
  });

  it("formula Overview yang sudah dikunci tidak berubah — hanya scope yang ditambah", () => {
    const source = sourceOf("src/server/workspace/pesanan-overview.ts");
    expect(source).toContain("('CONFIRMED','PARTIALLY_REFUNDED')");
    expect(source).toContain("calculatePendapatanBersih(gross, cos, com) - refund");
    expect(source).toContain("calculateAov(gross, jumlahPesanan)");
    expect(source).toContain("SUM(i.total_sales_value)");
    expect(source).toContain("SUM(i.total_hpp)");
  });
});

describe("EXPORT — CSV dan XLSX ikut bersih karena memakai listWorkspaceOrders", () => {
  const csvRoute = codeOf("src/app/api/workspace/pesanan/export.csv/route.ts");
  const xlsxRoute = codeOf("src/app/api/workspace/pesanan/export.xlsx/route.ts");

  it("kedua route export memakai list central, bukan query kedua sendiri", () => {
    for (const [name, route] of [["csv", csvRoute], ["xlsx", xlsxRoute]] as const) {
      expect(route, `${name} tidak lewat listWorkspaceOrders`).toContain("listWorkspaceOrders(filter)");
      expect(route, `${name} punya query sendiri ke workspace_orders`).not.toContain("workspace_orders");
    }
  });

  it("CSV export tidak memuat DATABASE_ALL", async () => {
    const { rows } = await listWithLeakedRowInDatabase();
    const csv = toWorkspacePesananCsv(toWorkspacePesananExportRows(rows));
    expect(csv).not.toContain("DATABASE_ALL");
    expect(csv).not.toContain("Buku Kurus");
  });

  it("XLSX export tidak memuat DATABASE_ALL", async () => {
    const { rows } = await listWithLeakedRowInDatabase();
    const sheet = XLSX.read(toWorkspacePesananXlsxBuffer(toWorkspacePesananExportRows(rows)), { type: "buffer" });
    const csv = XLSX.utils.sheet_to_csv(sheet.Sheets[sheet.SheetNames[0]!]!);
    expect(csv).not.toContain("DATABASE_ALL");
    expect(csv).not.toContain("Buku Kurus");
  });
});

describe("order MANUAL tetap terbaca normal (fix tidak kebablasan)", () => {
  it("muncul di daftar, KPI, detail, Overview, dan export", async () => {
    const { rows, total } = await listWithLeakedRowInDatabase();
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceType).toBe("MANUAL");
    expect(rows[0]!.customerName).toBe("Budi Manual");

    const csv = toWorkspacePesananCsv(toWorkspacePesananExportRows(rows));
    expect(csv).toContain("Budi Manual");
    expect(csv).toContain("MANUAL");

    rowsFor = (text) => (text.includes("workspace_order_items i LEFT JOIN") ? [] : [manualOrderHeader()]);
    const detail = await pesanan.getWorkspaceOrder(7);
    expect(detail?.sourceType).toBe("MANUAL");

    rowsFor = () => [{ jumlah_customer: "1", jumlah_pesanan: "1", nilai_transaksi: "150000", total_sales: "150000", cos: "40000" }];
    const kpi = await pesanan.getWorkspacePesananKpi(LIST_FILTER as never);
    expect(kpi.jumlahPesanan).toBe(1);
    expect(kpi.totalSales).toBe("150000");

    rowsFor = () => [{ jumlah_customer: "1", jumlah_pesanan: "1", gross: "150000", cos: "40000" }];
    const overviewKpi = await overview.getOverviewKpi(RANGE);
    expect(overviewKpi.gross).toBe("150000");
    expect(overviewKpi.jumlahPesanan).toBe(1);
  });
});

/**
 * Database menyimpan DUA baris: satu MANUAL yang sah dan satu DATABASE_ALL yang
 * bocor (dibiarkan untuk audit). Mock ini meniru database dengan menerapkan
 * predicate yang sama seperti Postgres: baris DATABASE_ALL hanya ikut terbaca
 * kalau SQL-nya lupa memfilter provenance.
 */
async function listWithLeakedRowInDatabase() {
  rowsFor = (text) => {
    const visible = text.includes("source_type") && text.includes("MANUAL") ? [manualListRow()] : [manualListRow(), leakedListRow()];
    return text.includes("COUNT(*)") ? [{ total: String(visible.length) }] : visible;
  };
  return pesanan.listWorkspaceOrders(LIST_FILTER as never);
}

function manualListRow() {
  return {
    id: 7,
    order_number: "PSN-000007",
    source_order_id: "EVP-7",
    order_date: "2026-08-01",
    customer_name: "Budi Manual",
    phone_display: "08123456789",
    crm_name_snapshot: "Sarah",
    products_summary: "Herbal Probetes x1",
    total_qty: "1",
    total_sales_value: "150000",
    cos: "40000",
    payment_method: "COD",
    order_total: "150000",
    status: "CONFIRMED",
    source_type: "MANUAL",
  };
}

/** Baris nyata yang bocor saat audit: workspace_order id=84, import_batch_id=25. */
function leakedListRow() {
  return {
    ...manualListRow(),
    id: 84,
    order_number: "PSN-000084",
    customer_name: "Leaked Database All",
    products_summary: "Buku Kurus x1",
    total_sales_value: "675000",
    order_total: "675000",
    source_type: "DATABASE_ALL",
  };
}

function manualOrderHeader() {
  return {
    id: 7,
    order_number: "PSN-000007",
    source_type: "MANUAL",
    source_order_id: "EVP-7",
    order_date: "2026-08-01",
    customer_name: "Budi Manual",
    normalized_phone: "628123456789",
    crm_name_snapshot: "Sarah",
    payment_method: "COD",
    shipping_charge: "0",
    packing_charge: "0",
    discount: "0",
    cod_admin: "0",
    crm_voucher: "0",
    total_sales_value: "150000",
    order_total: "150000",
    cod_value: "150000",
    status: "CONFIRMED",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}
