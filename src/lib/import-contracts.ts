import { z } from "zod";

export const IMPORT_CHUNK_MAX_ROWS = 1_000;

export const sourceRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  values: z.record(z.unknown()),
});

export const importInitSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  totalRows: z.number().int().nonnegative(),
  headers: z.array(z.string()).min(1).max(100),
});

export const importChunkSchema = z.object({
  batchId: z.number().int().positive(),
  rows: z.array(sourceRowSchema).min(1).max(IMPORT_CHUNK_MAX_ROWS),
});

export const importBatchSchema = z.object({ batchId: z.number().int().positive() });

export interface ImportPreview {
  batchId: number;
  filename: string;
  duplicate: boolean;
  status: "STAGED" | "COMPLETED";
  asOfDate: string | null;
  totalRows: number;
  validRows: number;
  excludedRows: number;
  needsReviewRows: number;
  orderCount: number;
  customerCount: number;
  issueCounts: Partial<Record<ImportIssueCode, number>>;
}

export const IMPORT_ISSUE_CODES = [
  "MISSING_PHONE",
  "INVALID_PHONE",
  "MISSING_NAME",
  "INVALID_DATE",
  "MISSING_ORDER_ID",
  "DUPLICATE_ORDER",
  "UNKNOWN_PRODUCT",
  "AMOUNT_CONFLICT",
  "NEEDS_REVIEW",
] as const;
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

/**
 * Populasi CRM final (docs/07-OPEN-QUESTIONS.md): baris dengan kode di sini
 * TIDAK PERNAH jadi canonical customer/order — bukan sekadar "issue untuk
 * diperbaiki CRM", tapi barisnya memang dikeluarkan dari populasi sejak awal.
 * Sisanya (UNKNOWN_PRODUCT, MISSING_ORDER_ID, AMOUNT_CONFLICT, NEEDS_REVIEW,
 * DUPLICATE_ORDER) adalah "Data Quality operasional" — customer SUDAH valid,
 * hanya punya masalah sekunder yang perlu ditinjau CRM.
 */
export const IMPORT_EXCLUSION_CODES = [
  "MISSING_PHONE",
  "INVALID_PHONE",
  "MISSING_NAME",
  "INVALID_DATE",
] as const satisfies readonly ImportIssueCode[];

export function isImportExclusionCode(code: ImportIssueCode): boolean {
  return (IMPORT_EXCLUSION_CODES as readonly string[]).includes(code);
}

export interface ImportCommitResult {
  batchId: number;
  asOfDate: string;
  customers: number;
  orders: number;
  items: number;
  excludedRows: number;
  needsReviewRows: number;
}
