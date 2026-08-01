import type { ImportIssueCode } from "./import-contracts";

export type ImportBatchHistoryRow = {
  id: number;
  sourceType: "DATABASE_ALL" | "KSB" | "GROUP_LIST";
  filename: string;
  status: "UPLOADING" | "STAGED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  isActive: boolean;
  uploadedAt: string;
  asOfDate: string | null;
  totalRows: number;
  validRows: number;
  excludedRows: number;
  needsReviewRows: number;
  errorMessage: string | null;
  uploadedBy: string | null;
};

export type ImportBatchHistoryResult = {
  rows: ImportBatchHistoryRow[];
  total: number;
  page: number;
  perPage: number;
};

export type DataQualityFilter = {
  batchId?: number;
  issueType?: ImportIssueCode;
  page?: number;
  perPage?: number;
};

export type DataQualityIssueRow = {
  id: number;
  batchId: number;
  filename: string;
  rowNumber: number | null;
  issueType: ImportIssueCode;
  detail: Record<string, unknown>;
  rawData: Record<string, unknown> | null;
  createdAt: string;
};

export type DataQualityResult = {
  rows: DataQualityIssueRow[];
  total: number;
  page: number;
  perPage: number;
  counts: Partial<Record<ImportIssueCode, number>>;
  batchId: number | null;
};
