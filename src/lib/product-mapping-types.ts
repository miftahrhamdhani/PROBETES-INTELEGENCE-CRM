/** SHARED — tipe & kontrak halaman Product Mapping (FR-25). Tanpa I/O, tanpa React. */
import { z } from "zod";

/** Satu nama produk mentah yang belum punya mapping canonical. */
export type UnknownProductRow = {
  rawProductName: string;
  /** Bentuk ternormalisasi yang dipakai sebagai kunci alias. */
  normalizedName: string;
  itemCount: number;
  customerCount: number;
  /** Customer terdampak yang saat ini berstatus NEEDS_REVIEW. */
  needsReviewCount: number;
  totalAmount: string;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type UnknownProductResult = {
  rows: UnknownProductRow[];
  total: number;
  page: number;
  perPage: number;
  /** Ringkasan global, tidak ikut terfilter — supaya admin tahu sisa pekerjaan. */
  totalUnknownItems: number;
  totalNeedsReviewCustomers: number;
};

export type CanonicalProductOption = {
  id: number;
  code: string;
  name: string;
  category: string;
};

export type ApprovedAliasRow = {
  id: number;
  rawName: string;
  normalizedName: string;
  productCode: string;
  productName: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

/** Dampak yang akan terjadi bila mapping disetujui — ditampilkan sebelum aksi. */
export type MappingImpactPreview = {
  normalizedName: string;
  targetProductCode: string;
  targetProductName: string;
  itemCount: number;
  customerCount: number;
  needsReviewBefore: number;
  /** Customer yang setelah remap TIDAK lagi punya item UNKNOWN sama sekali. */
  customersFullyResolved: number;
};

export const approveMappingSchema = z.object({
  rawProductName: z.string().trim().min(1).max(255),
  productId: z.coerce.number().int().positive(),
});

export const unknownProductFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  perPage: z.coerce.number().int().min(1).max(200).optional(),
});

export type UnknownProductFilter = z.infer<typeof unknownProductFilterSchema>;
