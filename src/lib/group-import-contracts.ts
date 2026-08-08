/**
 * SHARED — kontrak Import Data Grup. Fungsi murni, tanpa I/O, tanpa React.
 *
 * Import ini HANYA menandai customer EXISTING sebagai sudah masuk grup.
 * TIDAK pernah membuat customer, order, atau transaksi apa pun.
 */
import { z } from "zod";

/** Kolom yang dikenali. Hanya PHONE yang wajib — sisanya melengkapi metadata. */
export const GROUP_IMPORT_FIELDS = ["phone", "customerName", "groupName", "pic", "joinedAt", "notes"] as const;
export type GroupImportField = (typeof GROUP_IMPORT_FIELDS)[number];

/**
 * Alias header yang umum dipakai. Dicocokkan case-insensitive setelah
 * dinormalisasi (huruf/angka saja), sehingga "No. HP", "no_hp", dan "NO HP"
 * sama-sama terdeteksi.
 *
 * Kalau kolom telepon TIDAK terdeteksi, UI WAJIB meminta user memilih sendiri —
 * tidak ada tebakan diam-diam (lihat resolveColumnMapping).
 */
export const GROUP_IMPORT_ALIASES: Record<GroupImportField, string[]> = {
  phone: ["no hp", "nohp", "nomor hp", "no. hp", "phone", "telepon", "whatsapp", "wa", "no wa", "nomor whatsapp"],
  customerName: ["nama", "customer", "nama customer", "nama konsumen", "name"],
  groupName: ["nama grup", "grup", "group", "grup konsultasi", "group name", "nama group"],
  pic: ["pic", "cs", "penanggung jawab", "penanggungjawab", "admin"],
  joinedAt: ["tanggal masuk grup", "tanggal masuk", "tanggal join", "join date", "joined at", "tgl masuk grup"],
  notes: ["catatan", "note", "notes", "keterangan"],
};

/** Bandingkan header apa adanya: huruf+angka saja, lowercase. */
export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type GroupColumnMapping = Partial<Record<GroupImportField, string>>;

/**
 * Deteksi otomatis kolom dari daftar header. Hanya mencocokkan alias yang
 * PERSIS — tidak ada pencocokan sebagian/fuzzy, supaya tidak ada pemetaan
 * ambigu yang terjadi diam-diam.
 */
export function resolveColumnMapping(headers: string[]): GroupColumnMapping {
  const mapping: GroupColumnMapping = {};
  const normalized = headers.map((header) => ({ asli: header, norm: normalizeHeader(header) }));
  for (const field of GROUP_IMPORT_FIELDS) {
    const alias = GROUP_IMPORT_ALIASES[field].map(normalizeHeader);
    const cocok = normalized.find((header) => alias.includes(header.norm));
    if (cocok) mapping[field] = cocok.asli;
  }
  return mapping;
}

/** Status per baris file. Hanya NEW_MEMBER & UPDATE yang menghasilkan tulisan. */
export const GROUP_IMPORT_STATUSES = [
  "NEW_MEMBER",
  "ALREADY_GROUPED",
  "UPDATE",
  "UNMATCHED",
  "INVALID_PHONE",
  "DUPLICATE_IN_FILE",
] as const;
export type GroupImportStatus = (typeof GROUP_IMPORT_STATUSES)[number];

export const GROUP_IMPORT_STATUS_LABELS: Record<GroupImportStatus, string> = {
  NEW_MEMBER: "Member Baru",
  ALREADY_GROUPED: "Sudah Grouped",
  UPDATE: "Update",
  UNMATCHED: "Tidak Ditemukan",
  INVALID_PHONE: "No HP Invalid",
  DUPLICATE_IN_FILE: "Duplikat di File",
};

/** Status yang benar-benar mengubah database saat commit. */
export const GROUP_IMPORT_WRITE_STATUSES: readonly GroupImportStatus[] = ["NEW_MEMBER", "UPDATE"];

export type GroupImportPreviewRow = {
  rowNumber: number;
  /** Nomor apa adanya dari file — untuk ditampilkan saat invalid. */
  rawPhone: string;
  normalizedPhone: string | null;
  fileName: string | null;
  customerId: number | null;
  customerName: string | null;
  clusterCode: string | null;
  groupName: string | null;
  pic: string | null;
  joinedAt: string | null;
  status: GroupImportStatus;
  /** Diisi untuk status UPDATE: metadata apa yang berubah. */
  changes: { field: string; before: string; after: string }[];
};

export type GroupImportSummary = {
  totalRows: number;
  validPhone: number;
  matched: number;
  newMember: number;
  alreadyGrouped: number;
  updated: number;
  unmatched: number;
  invalidPhone: number;
  duplicateInFile: number;
};

export type GroupImportPreview = {
  summary: GroupImportSummary;
  mapping: GroupColumnMapping;
  /** Dibatasi agar payload preview tetap ringan; commit tetap memproses semua. */
  rows: GroupImportPreviewRow[];
  truncated: boolean;
};

export type GroupImportResult = GroupImportSummary & { batchId: number };

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();

export const groupImportRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  values: z.record(z.string(), cell),
});

export const groupImportPayloadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  /** Batas aman satu berkas — melindungi memori server. */
  rows: z.array(groupImportRowSchema).min(1).max(50_000),
  mapping: z.record(z.string(), z.string()).optional(),
});
export type GroupImportPayload = z.infer<typeof groupImportPayloadSchema>;
