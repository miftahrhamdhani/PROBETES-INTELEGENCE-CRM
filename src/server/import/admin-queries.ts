/** BACKEND — query read-only Import History dan Data Quality. */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { ImportIssueCode } from "@/lib/import-contracts";
import type {
  DataQualityFilter,
  DataQualityResult,
  ImportBatchHistoryResult,
} from "@/lib/import-admin-types";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

export async function listImportHistory(page = 1, perPage = DEFAULT_PER_PAGE): Promise<ImportBatchHistoryResult> {
  const safePage = Math.max(page, 1);
  const safePerPage = Math.min(Math.max(perPage, 1), MAX_PER_PAGE);
  const offset = (safePage - 1) * safePerPage;
  const db = getDb();
  const [rows, total] = await Promise.all([
    db.execute<{
      id: number;
      source_type: "DATABASE_ALL" | "KSB" | "GROUP_LIST";
      filename: string;
      status: "UPLOADING" | "STAGED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
      is_active: boolean;
      uploaded_at: string;
      as_of_date: string | null;
      total_rows: number;
      valid_rows: number;
      excluded_rows: number;
      needs_review_rows: number;
      error_message: string | null;
      uploaded_by: string | null;
    }>(sql`
      SELECT
        b.id, b.source_type, b.filename, b.status, b.is_active,
        b.uploaded_at::text, b.as_of_date::text,
        b.total_rows, b.valid_rows, b.excluded_rows, b.needs_review_rows,
        b.error_message, u.name AS uploaded_by
      FROM import_batches b
      LEFT JOIN users u ON u.id = b.uploaded_by
      ORDER BY b.uploaded_at DESC, b.id DESC
      LIMIT ${safePerPage} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM import_batches`),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      filename: row.filename,
      status: row.status,
      isActive: row.is_active,
      uploadedAt: row.uploaded_at,
      asOfDate: row.as_of_date,
      totalRows: row.total_rows,
      validRows: row.valid_rows,
      excludedRows: row.excluded_rows,
      needsReviewRows: row.needs_review_rows,
      errorMessage: row.error_message,
      uploadedBy: row.uploaded_by,
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page: safePage,
    perPage: safePerPage,
  };
}

export async function listDataQualityIssues(filter: DataQualityFilter): Promise<DataQualityResult> {
  const page = Math.max(filter.page ?? 1, 1);
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const offset = (page - 1) * perPage;
  const db = getDb();

  const activeBatch = filter.batchId ?? Number((await db.execute<{ id: number }>(sql`
    SELECT id FROM import_batches
    WHERE source_type = 'DATABASE_ALL' AND is_active = true
    LIMIT 1
  `)).rows[0]?.id ?? 0);

  if (!activeBatch) return { rows: [], total: 0, page, perPage, counts: {}, batchId: null };

  const issueCondition = filter.issueType ? sql`AND q.issue_type = ${filter.issueType}` : sql``;
  const [rows, total, counts] = await Promise.all([
    db.execute<{
      id: number;
      batch_id: number;
      filename: string;
      row_number: number | null;
      issue_type: ImportIssueCode;
      detail: Record<string, unknown>;
      raw_data: Record<string, unknown> | null;
      created_at: string;
    }>(sql`
      SELECT
        q.id, q.import_batch_id AS batch_id, b.filename,
        sr.row_number, q.issue_type, q.detail, sr.raw_data,
        q.created_at::text
      FROM data_quality_issues q
      JOIN import_batches b ON b.id = q.import_batch_id
      LEFT JOIN staging_import_rows sr ON sr.id = q.staging_row_id
      WHERE q.import_batch_id = ${activeBatch}
        ${issueCondition}
      ORDER BY sr.row_number NULLS LAST, q.id
      LIMIT ${perPage} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total
      FROM data_quality_issues q
      WHERE q.import_batch_id = ${activeBatch}
        ${issueCondition}
    `),
    db.execute<{ issue_type: ImportIssueCode; total: string }>(sql`
      SELECT issue_type::text AS issue_type, COUNT(*)::text AS total
      FROM data_quality_issues
      WHERE import_batch_id = ${activeBatch}
      GROUP BY issue_type
    `),
  ]);

  const countMap: Partial<Record<ImportIssueCode, number>> = {};
  for (const row of counts.rows) countMap[row.issue_type] = Number(row.total);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      filename: row.filename,
      rowNumber: row.row_number,
      issueType: row.issue_type,
      detail: row.detail,
      rawData: row.raw_data,
      createdAt: row.created_at,
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page,
    perPage,
    counts: countMap,
    batchId: activeBatch,
  };
}
