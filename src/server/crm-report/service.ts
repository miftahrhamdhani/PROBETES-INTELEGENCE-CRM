import { eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { crmReportItems, crmReports, customers } from "@/server/db/schema";
import { normalizePhone } from "@/server/normalize/phone";
import type { CrmReportBody, CrmReportListFilter } from "@/lib/crm-report-contracts";
import type { CrmReportDetail, CrmReportListResult, CrmReportRow } from "@/lib/crm-report-types";

export class CrmReportNotFoundError extends Error {}

const DEFAULT_PER_PAGE = 60;
const MAX_PER_PAGE = 200;

/** Best-effort match ke customer Database All by normalized phone — laporan
 *  tetap tersimpan walau nomor belum/tidak pernah ada di Database All. */
async function resolveCustomer(phone: string): Promise<{ customerId: number | null; normalizedPhone: string | null }> {
  const normalized = normalizePhone(phone);
  if (normalized.status !== "VALID") return { customerId: null, normalizedPhone: null };
  const db = getDb();
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedPhone, normalized.normalized))
    .limit(1);
  return { customerId: row?.id ?? null, normalizedPhone: normalized.normalized };
}

function toItemValues(reportId: number, items: CrmReportBody["items"]) {
  return items.slice(0, 5).map((item, index) => ({
    crmReportId: reportId,
    lineNo: index + 1,
    productName: item.productName,
    qty: String(item.qty),
    productValue: BigInt(item.productValue),
    itemNote: item.itemNote?.trim() || null,
  }));
}

export async function createReport(input: CrmReportBody, userId: number): Promise<number> {
  const { customerId, normalizedPhone } = await resolveCustomer(input.phone);
  const db = getDb();
  const [row] = await db
    .insert(crmReports)
    .values({
      customerId,
      customerName: input.customerName,
      phone: input.phone,
      normalizedPhone,
      address: input.address ?? null,
      expedition: input.expedition ?? null,
      memo: input.memo ?? null,
      paymentMethod: input.paymentMethod ?? null,
      shippingCost: BigInt(input.shippingCost ?? 0),
      packingCost: BigInt(input.packingCost ?? 0),
      discount: BigInt(input.discount ?? 0),
      adminCod: BigInt(input.adminCod ?? 0),
      totalPayment: BigInt(input.totalPayment ?? 0),
      csName: input.csName ?? null,
      advName: input.advName ?? null,
      note: input.note ?? null,
      hub: input.hub ?? null,
      city: input.city ?? null,
      reportDate: input.reportDate,
      orderClosingCount: input.orderClosingCount != null ? Number(input.orderClosingCount) : null,
      salesType: input.salesType ?? null,
      platform: input.platform ?? null,
      division: input.division ?? null,
      dataReceivedCount: input.dataReceivedCount != null ? Number(input.dataReceivedCount) : null,
      crmVoucher: input.crmVoucher ?? null,
      codValue: BigInt(input.codValue ?? 0),
      recipientDistrict: input.recipientDistrict ?? null,
      recipientPostalCode: input.recipientPostalCode ?? null,
      partner: input.partner ?? null,
      crmMarketingCost: BigInt(input.crmMarketingCost ?? 0),
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: crmReports.id });
  if (!row) throw new Error("Gagal membuat CRM Report");

  await db.insert(crmReportItems).values(toItemValues(row.id, input.items));
  return row.id;
}

export async function updateReport(id: number, input: CrmReportBody, userId: number): Promise<void> {
  const { customerId, normalizedPhone } = await resolveCustomer(input.phone);
  const db = getDb();
  const result = await db
    .update(crmReports)
    .set({
      customerId,
      customerName: input.customerName,
      phone: input.phone,
      normalizedPhone,
      address: input.address ?? null,
      expedition: input.expedition ?? null,
      memo: input.memo ?? null,
      paymentMethod: input.paymentMethod ?? null,
      shippingCost: BigInt(input.shippingCost ?? 0),
      packingCost: BigInt(input.packingCost ?? 0),
      discount: BigInt(input.discount ?? 0),
      adminCod: BigInt(input.adminCod ?? 0),
      totalPayment: BigInt(input.totalPayment ?? 0),
      csName: input.csName ?? null,
      advName: input.advName ?? null,
      note: input.note ?? null,
      hub: input.hub ?? null,
      city: input.city ?? null,
      reportDate: input.reportDate,
      orderClosingCount: input.orderClosingCount != null ? Number(input.orderClosingCount) : null,
      salesType: input.salesType ?? null,
      platform: input.platform ?? null,
      division: input.division ?? null,
      dataReceivedCount: input.dataReceivedCount != null ? Number(input.dataReceivedCount) : null,
      crmVoucher: input.crmVoucher ?? null,
      codValue: BigInt(input.codValue ?? 0),
      recipientDistrict: input.recipientDistrict ?? null,
      recipientPostalCode: input.recipientPostalCode ?? null,
      partner: input.partner ?? null,
      crmMarketingCost: BigInt(input.crmMarketingCost ?? 0),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(crmReports.id, id))
    .returning({ id: crmReports.id });
  if (!result[0]) throw new CrmReportNotFoundError();

  await db.delete(crmReportItems).where(eq(crmReportItems.crmReportId, id));
  await db.insert(crmReportItems).values(toItemValues(id, input.items));
}

/** Total nilai laporan sesuai filter aktif — KPI "nilai laporan/closing" di
 *  Workspace > Laporan Kerja, dihitung dari hasil filter yang sedang dilihat. */
export async function getReportTotalValue(filter: CrmReportListFilter): Promise<{ count: number; totalPayment: string }> {
  const where = andAll(buildConditions(filter));
  const result = await getDb().execute<{ count: string; total_payment: string }>(sql`
    SELECT COUNT(*)::text AS count, COALESCE(SUM(r.total_payment), 0)::text AS total_payment
    FROM crm_reports r
    LEFT JOIN crm_tasks wt ON wt.id = r.task_id
    WHERE ${where}
  `);
  const row = result.rows[0];
  return { count: Number(row?.count ?? 0), totalPayment: row?.total_payment ?? "0" };
}

/** Daftar platform unik yang pernah diisi CRM — untuk dropdown filter Workspace > Laporan Kerja. */
export async function listReportPlatforms(): Promise<string[]> {
  const result = await getDb().execute<{ platform: string }>(sql`
    SELECT DISTINCT platform FROM crm_reports WHERE platform IS NOT NULL AND platform <> '' ORDER BY platform
  `);
  return result.rows.map((row) => row.platform);
}

/** Laporan terbaru milik satu customer — dipakai dialog "selesaikan task" Workspace
 *  untuk menautkan laporan closing yang sudah diinput ke task ini (opsional). */
export async function listReportsForCustomer(
  customerId: number
): Promise<{ id: number; reportDate: string; totalPayment: string; itemsSummary: string; linked: boolean }[]> {
  const result = await getDb().execute<{
    id: number;
    report_date: string;
    total_payment: string;
    items_summary: string | null;
    task_id: number | null;
  }>(sql`
    SELECT r.id, r.report_date::text AS report_date, r.total_payment::text AS total_payment,
      (SELECT string_agg(i.product_name || ' x' || i.qty, ', ' ORDER BY i.line_no) FROM crm_report_items i WHERE i.crm_report_id = r.id) AS items_summary,
      r.task_id
    FROM crm_reports r
    WHERE r.customer_id = ${customerId} AND r.archived_at IS NULL
    ORDER BY r.report_date DESC, r.id DESC
    LIMIT 10
  `);
  return result.rows.map((row) => ({
    id: row.id,
    reportDate: row.report_date,
    totalPayment: row.total_payment,
    itemsSummary: row.items_summary ?? "—",
    linked: row.task_id != null,
  }));
}

export async function setReportArchived(id: number, archived: boolean, userId: number): Promise<void> {
  const db = getDb();
  const result = await db
    .update(crmReports)
    .set({ archivedAt: archived ? new Date() : null, updatedBy: userId, updatedAt: new Date() })
    .where(eq(crmReports.id, id))
    .returning({ id: crmReports.id });
  if (!result[0]) throw new CrmReportNotFoundError();
}

function buildConditions(filter: CrmReportListFilter): SQL[] {
  const conditions: SQL[] = [];
  if (!filter.includeArchived) conditions.push(sql`r.archived_at IS NULL`);

  const search = filter.search?.trim();
  if (search) {
    const digits = search.replace(/\D+/g, "");
    conditions.push(
      digits.length >= 3
        ? sql`(r.customer_name ILIKE ${"%" + search + "%"} OR r.phone LIKE ${"%" + digits + "%"})`
        : sql`r.customer_name ILIKE ${"%" + search + "%"}`
    );
  }
  if (filter.csName?.trim()) conditions.push(sql`r.cs_name = ${filter.csName.trim()}`);
  if (filter.platform?.trim()) conditions.push(sql`r.platform = ${filter.platform.trim()}`);
  if (filter.division?.trim()) conditions.push(sql`r.division = ${filter.division.trim()}`);
  if (filter.salesType?.trim()) conditions.push(sql`r.sales_type = ${filter.salesType.trim()}`);
  if (filter.dateFrom) conditions.push(sql`r.report_date >= ${filter.dateFrom}::date`);
  if (filter.dateTo) conditions.push(sql`r.report_date <= ${filter.dateTo}::date`);
  // Filter Workspace > Laporan Kerja — hanya cocok untuk laporan yang tertaut task.
  if (typeof filter.pic === "number") conditions.push(sql`wt.assigned_to = ${filter.pic}`);
  if (filter.taskType) conditions.push(sql`wt.task_type = ${filter.taskType}`);
  if (filter.taskStatus) conditions.push(sql`wt.status = ${filter.taskStatus}`);
  if (filter.outcome) conditions.push(sql`wt.outcome = ${filter.outcome}`);
  return conditions.length ? conditions : [sql`true`];
}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

export async function listReports(filter: CrmReportListFilter): Promise<CrmReportListResult> {
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filter.page ?? 1, 1);
  const offset = (page - 1) * perPage;
  const where = andAll(buildConditions(filter));
  const db = getDb();

  const [rows, totals] = await Promise.all([
    db.execute<{
      id: number;
      customer_id: number | null;
      customer_name: string;
      phone: string;
      city: string | null;
      cs_name: string | null;
      adv_name: string | null;
      platform: string | null;
      division: string | null;
      sales_type: string | null;
      report_date: string;
      total_payment: string;
      items_summary: string | null;
      archived_at: string | null;
      created_by_name: string | null;
      task_id: number | null;
      task_type: string | null;
      task_status: string | null;
      task_outcome: string | null;
      task_pic_name: string | null;
    }>(sql`
      SELECT
        r.id, r.customer_id, r.customer_name, r.phone, r.city, r.cs_name, r.adv_name,
        r.platform, r.division, r.sales_type, r.report_date::text, r.total_payment::text,
        (SELECT string_agg(i.product_name || ' x' || i.qty, ', ' ORDER BY i.line_no) FROM crm_report_items i WHERE i.crm_report_id = r.id) AS items_summary,
        r.archived_at::text AS archived_at,
        creator.name AS created_by_name,
        wt.id AS task_id, wt.task_type::text AS task_type, wt.status::text AS task_status,
        wt.outcome::text AS task_outcome, wtpic.name AS task_pic_name
      FROM crm_reports r
      LEFT JOIN users creator ON creator.id = r.created_by
      LEFT JOIN crm_tasks wt ON wt.id = r.task_id
      LEFT JOIN users wtpic ON wtpic.id = wt.assigned_to
      WHERE ${where}
      ORDER BY r.report_date DESC, r.id DESC
      LIMIT ${perPage} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM crm_reports r LEFT JOIN crm_tasks wt ON wt.id = r.task_id WHERE ${where}
    `),
  ]);

  return {
    rows: rows.rows.map(
      (row): CrmReportRow => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        phone: row.phone,
        city: row.city,
        csName: row.cs_name,
        advName: row.adv_name,
        platform: row.platform,
        division: row.division,
        salesType: row.sales_type,
        reportDate: row.report_date,
        totalPayment: row.total_payment,
        itemsSummary: row.items_summary ?? "—",
        archivedAt: row.archived_at,
        createdByName: row.created_by_name,
        taskId: row.task_id,
        taskType: row.task_type,
        taskStatus: row.task_status,
        taskOutcome: row.task_outcome,
        taskPicName: row.task_pic_name,
      })
    ),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
  };
}

export async function getReport(id: number): Promise<CrmReportDetail | null> {
  const db = getDb();
  const [reportRows, itemRows] = await Promise.all([
    db.execute<{
      id: number;
      customer_id: number | null;
      customer_name: string;
      phone: string;
      address: string | null;
      expedition: string | null;
      memo: string | null;
      payment_method: string | null;
      shipping_cost: string;
      packing_cost: string;
      discount: string;
      admin_cod: string;
      total_payment: string;
      cs_name: string | null;
      adv_name: string | null;
      note: string | null;
      hub: string | null;
      city: string | null;
      report_date: string;
      order_closing_count: number | null;
      sales_type: string | null;
      platform: string | null;
      division: string | null;
      data_received_count: number | null;
      crm_voucher: string | null;
      cod_value: string;
      recipient_district: string | null;
      recipient_postal_code: string | null;
      partner: string | null;
      crm_marketing_cost: string;
      archived_at: string | null;
      created_at: string;
      updated_at: string;
      created_by_name: string | null;
      updated_by_name: string | null;
    }>(sql`
      SELECT
        r.id, r.customer_id, r.customer_name, r.phone, r.address, r.expedition, r.memo,
        r.payment_method, r.shipping_cost::text, r.packing_cost::text, r.discount::text,
        r.admin_cod::text, r.total_payment::text, r.cs_name, r.adv_name, r.note, r.hub, r.city,
        r.report_date::text, r.order_closing_count, r.sales_type, r.platform, r.division,
        r.data_received_count, r.crm_voucher, r.cod_value::text, r.recipient_district,
        r.recipient_postal_code, r.partner, r.crm_marketing_cost::text,
        r.archived_at::text AS archived_at, r.created_at::text AS created_at, r.updated_at::text AS updated_at,
        creator.name AS created_by_name, updater.name AS updated_by_name
      FROM crm_reports r
      LEFT JOIN users creator ON creator.id = r.created_by
      LEFT JOIN users updater ON updater.id = r.updated_by
      WHERE r.id = ${id}
    `),
    db.execute<{ id: number; line_no: number; product_name: string; qty: string; product_value: string; item_note: string | null }>(sql`
      SELECT id, line_no, product_name, qty::text, product_value::text, item_note
      FROM crm_report_items WHERE crm_report_id = ${id} ORDER BY line_no
    `),
  ]);

  const row = reportRows.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone,
    address: row.address,
    expedition: row.expedition,
    memo: row.memo,
    paymentMethod: row.payment_method,
    items: itemRows.rows.map((item) => ({
      id: item.id,
      lineNo: item.line_no,
      productName: item.product_name,
      qty: item.qty,
      productValue: item.product_value,
      itemNote: item.item_note,
    })),
    shippingCost: row.shipping_cost,
    packingCost: row.packing_cost,
    discount: row.discount,
    adminCod: row.admin_cod,
    totalPayment: row.total_payment,
    csName: row.cs_name,
    advName: row.adv_name,
    note: row.note,
    hub: row.hub,
    city: row.city,
    reportDate: row.report_date,
    orderClosingCount: row.order_closing_count,
    salesType: row.sales_type,
    platform: row.platform,
    division: row.division,
    dataReceivedCount: row.data_received_count,
    crmVoucher: row.crm_voucher,
    codValue: row.cod_value,
    recipientDistrict: row.recipient_district,
    recipientPostalCode: row.recipient_postal_code,
    partner: row.partner,
    crmMarketingCost: row.crm_marketing_cost,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
  };
}

/** Nama produk unik yang pernah diinput CRM — untuk autocomplete input Nama
 *  Produk. Murni bantuan ketik, BUKAN katalog produk canonical (products/
 *  product_aliases) — CRM Report tetap tidak tersambung ke mapping produk. */
export async function listReportProductNames(): Promise<string[]> {
  const result = await getDb().execute<{ product_name: string }>(sql`
    SELECT DISTINCT product_name FROM crm_report_items ORDER BY product_name LIMIT 500
  `);
  return result.rows.map((row) => row.product_name);
}

const EXPORT_LIMIT = 20_000;

export type CrmReportExportRow = Record<string, string | number>;

/** Flatten satu laporan + item jadi satu baris untuk export CSV/Excel — kolom
 *  Produk/QTY/Nilai 1..5 hanya representasi export, BUKAN schema DB (tetap relational). */
export async function buildExportRows(filter: CrmReportListFilter): Promise<CrmReportExportRow[]> {
  const where = andAll(buildConditions(filter));
  const db = getDb();
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT
      r.id, r.customer_name, r.phone, r.address, r.expedition, r.memo, r.payment_method,
      r.shipping_cost::text AS shipping_cost, r.packing_cost::text AS packing_cost,
      r.discount::text AS discount, r.admin_cod::text AS admin_cod, r.total_payment::text AS total_payment,
      r.cs_name, r.adv_name, r.note, r.hub, r.city, r.report_date::text AS report_date,
      r.order_closing_count, r.sales_type, r.platform, r.division, r.data_received_count,
      r.crm_voucher, r.cod_value::text AS cod_value, r.recipient_district, r.recipient_postal_code,
      r.partner, r.crm_marketing_cost::text AS crm_marketing_cost,
      (SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.qty, 'value', i.product_value) ORDER BY i.line_no)
       FROM crm_report_items i WHERE i.crm_report_id = r.id) AS items
    FROM crm_reports r
    LEFT JOIN crm_tasks wt ON wt.id = r.task_id
    WHERE ${where}
    ORDER BY r.report_date DESC, r.id DESC
    LIMIT ${EXPORT_LIMIT}
  `);

  return result.rows.map((row) => {
    const items = (row.items as { name: string; qty: string; value: string }[] | null) ?? [];
    const flat: CrmReportExportRow = {
      NamaKonsumen: String(row.customer_name ?? ""),
      NoHp: String(row.phone ?? ""),
      Alamat: String(row.address ?? ""),
      Ekspedisi: String(row.expedition ?? ""),
      Memo: String(row.memo ?? ""),
      Pembayaran: String(row.payment_method ?? ""),
      Ongkir: Number(row.shipping_cost ?? 0),
      Packing: Number(row.packing_cost ?? 0),
      Diskon: Number(row.discount ?? 0),
      AdminCOD: Number(row.admin_cod ?? 0),
      TotalBayar: Number(row.total_payment ?? 0),
      NamaCS: String(row.cs_name ?? ""),
      NamaADV: String(row.adv_name ?? ""),
      Note: String(row.note ?? ""),
      Hub: String(row.hub ?? ""),
      Kota: String(row.city ?? ""),
      Tanggal: String(row.report_date ?? ""),
      JumlahOrderClosing: Number(row.order_closing_count ?? 0),
      TypeSales: String(row.sales_type ?? ""),
      Platform: String(row.platform ?? ""),
      Divisi: String(row.division ?? ""),
      JumlahTerimaData: Number(row.data_received_count ?? 0),
      VoucherCRM: String(row.crm_voucher ?? ""),
      NilaiCOD: Number(row.cod_value ?? 0),
      KecamatanPenerima: String(row.recipient_district ?? ""),
      KodePosPenerima: String(row.recipient_postal_code ?? ""),
      Mitra: String(row.partner ?? ""),
      BiayaMarketingCRM: Number(row.crm_marketing_cost ?? 0),
    };
    for (let i = 0; i < 5; i++) {
      const item = items[i];
      flat[`Produk${i + 1}`] = item?.name ?? "";
      flat[`QTY${i + 1}`] = item ? Number(item.qty) : "";
      flat[`NilaiProduk${i + 1}`] = item ? Number(item.value) : "";
    }
    return flat;
  });
}
