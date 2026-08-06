import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

/**
 * Laporan closing manual milik satu customer — dipakai dialog "selesaikan
 * task" Workspace untuk menautkan laporan yang sudah diinput ke task ini
 * (opsional). Dipindah ke sini (dari `server/crm-report/service.ts`, yang
 * dihapus) karena ini satu-satunya bagian dari modul CRM Report lama yang
 * masih dipakai fitur aktif (Pembagian Tugas) — sisanya (Input Kerja/Laporan
 * Kerja) sudah dihapus, digantikan total oleh Workspace Pesanan.
 */
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
