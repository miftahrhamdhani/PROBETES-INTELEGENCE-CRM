/**
 * BACKEND — Import Data Grup (CSV/XLSX).
 *
 * Tujuan tunggal: MENANDAI customer yang SUDAH ADA sebagai sudah masuk grup.
 *
 * YANG TIDAK PERNAH DILAKUKAN:
 *   - membuat customer baru (nomor tak dikenal -> UNMATCHED, berhenti di situ);
 *   - membuat order/transaksi;
 *   - menyentuh RFM/Cohort/Frequency;
 *   - mengubah rumus cluster;
 *   - mengeluarkan member lama yang tidak ada di file (import bersifat ADITIF).
 *
 * SSOT-nya sama persis dengan aksi manual "Masukkan ke Grup" di Customers:
 * tabel `customer_group_memberships` + `customer_group_membership_history`.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { recalculateClusterForCustomer } from "@/server/import/orchestrator";
import { normalizePhone } from "@/server/normalize/phone";
import { cleanText } from "@/server/normalize/text";
import {
  resolveColumnMapping,
  type GroupColumnMapping,
  type GroupImportPayload,
  type GroupImportPreview,
  type GroupImportPreviewRow,
  type GroupImportResult,
  type GroupImportSummary,
} from "@/lib/group-import-contracts";

export class GroupImportError extends Error {}

/** Preview hanya mengirim sebagian baris; commit tetap memproses seluruhnya. */
const PREVIEW_ROW_LIMIT = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Angka dari Excel harus jadi string utuh, bukan notasi ilmiah.
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value);
  return String(value);
}

/** Tanggal hanya diterima kalau bentuknya jelas — sisanya diabaikan, tidak ditebak. */
function parseJoinedAt(value: unknown): string | null {
  const raw = cleanText(text(value));
  if (!raw) return null;
  if (ISO_DATE.test(raw)) return raw;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

type NormalizedRow = {
  rowNumber: number;
  rawPhone: string;
  normalizedPhone: string | null;
  fileName: string | null;
  groupName: string | null;
  pic: string | null;
  joinedAt: string | null;
  notes: string | null;
};

function normalizeRows(payload: GroupImportPayload, mapping: GroupColumnMapping): NormalizedRow[] {
  const pick = (values: Record<string, unknown>, field: keyof GroupColumnMapping) => {
    const column = mapping[field];
    return column ? values[column] : undefined;
  };
  return payload.rows.map((row) => {
    const rawPhone = cleanText(text(pick(row.values, "phone")));
    const phone = normalizePhone(rawPhone);
    return {
      rowNumber: row.rowNumber,
      rawPhone,
      normalizedPhone: phone.status === "VALID" ? phone.normalized : null,
      fileName: cleanText(text(pick(row.values, "customerName"))) || null,
      groupName: cleanText(text(pick(row.values, "groupName"))) || null,
      pic: cleanText(text(pick(row.values, "pic"))) || null,
      joinedAt: parseJoinedAt(pick(row.values, "joinedAt")),
      notes: cleanText(text(pick(row.values, "notes"))) || null,
    };
  });
}

type CustomerMatch = {
  customer_id: number;
  normalized_phone: string;
  customer_name: string | null;
  cluster_code: string | null;
  status: string | null;
  group_name: string | null;
  pic_user_id: number | null;
  pic_name: string | null;
  joined_at: string | null;
};

/** Daftar nilai ter-parameterisasi untuk klausa IN — array JS tidak bisa
 *  dikirim langsung lewat template `sql` (Postgres menerimanya sebagai record). */
function inList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
}

async function matchCustomers(phones: string[]): Promise<Map<string, CustomerMatch>> {
  if (!phones.length) return new Map();
  const result = await getDb().execute<CustomerMatch>(sql`
    SELECT c.id AS customer_id, c.normalized_phone, c.name AS customer_name,
           cc.cluster_code, gm.status::text AS status, gm.group_name,
           gm.pic_user_id, pic.name AS pic_name, gm.joined_at::text AS joined_at
    FROM customers c
    LEFT JOIN customer_cluster_current cc ON cc.customer_id = c.id
    LEFT JOIN customer_group_memberships gm ON gm.customer_id = c.id
    LEFT JOIN users pic ON pic.id = gm.pic_user_id
    WHERE c.normalized_phone IN (${inList(phones)})
      AND c.name IS NOT NULL AND btrim(c.name) <> '' AND c.archived_at IS NULL
  `);
  return new Map(result.rows.map((row) => [row.normalized_phone, row]));
}

/** Nama PIC -> user id. Nama tak dikenal diabaikan (PIC lama dipertahankan). */
async function matchPics(names: string[]): Promise<Map<string, number>> {
  const unik = [...new Set(names.filter(Boolean))];
  if (!unik.length) return new Map();
  const result = await getDb().execute<{ id: number; name: string }>(sql`
    SELECT id, name FROM users WHERE lower(name) IN (${inList(unik.map((n) => n.toLowerCase()))})
  `);
  return new Map(result.rows.map((row) => [row.name.toLowerCase(), row.id]));
}

type Analyzed = {
  rows: GroupImportPreviewRow[];
  summary: GroupImportSummary;
  /** Hanya baris yang benar-benar akan ditulis. */
  writes: {
    customerId: number;
    groupName: string | null;
    pic: number | null;
    joinedAt: string | null;
    notes: string | null;
    statusBerubah: boolean;
  }[];
};

/**
 * Menentukan status setiap baris. Dipakai preview MAUPUN commit — commit tidak
 * pernah mempercayai klasifikasi yang dikirim client, ia menghitung ulang di sini.
 */
async function analyze(payload: GroupImportPayload, mapping: GroupColumnMapping): Promise<Analyzed> {
  const normalized = normalizeRows(payload, mapping);
  const phones = [...new Set(normalized.map((r) => r.normalizedPhone).filter((p): p is string => !!p))];
  const [customers, pics] = await Promise.all([
    matchCustomers(phones),
    matchPics(normalized.map((r) => r.pic ?? "")),
  ]);

  const sudahDilihat = new Set<string>();
  const rows: GroupImportPreviewRow[] = [];
  const writes: Analyzed["writes"] = [];
  const summary: GroupImportSummary = {
    totalRows: normalized.length,
    validPhone: 0,
    matched: 0,
    newMember: 0,
    alreadyGrouped: 0,
    updated: 0,
    unmatched: 0,
    invalidPhone: 0,
    duplicateInFile: 0,
  };

  for (const row of normalized) {
    const dasar = {
      rowNumber: row.rowNumber,
      rawPhone: row.rawPhone,
      normalizedPhone: row.normalizedPhone,
      fileName: row.fileName,
      groupName: row.groupName,
      pic: row.pic,
      joinedAt: row.joinedAt,
      changes: [] as { field: string; before: string; after: string }[],
    };

    if (!row.normalizedPhone) {
      summary.invalidPhone += 1;
      rows.push({ ...dasar, customerId: null, customerName: null, clusterCode: null, status: "INVALID_PHONE" });
      continue;
    }
    summary.validPhone += 1;

    // Nomor sama muncul lebih dari sekali dalam satu file: hanya kemunculan
    // PERTAMA yang diproses, sisanya dihitung sebagai duplikat.
    if (sudahDilihat.has(row.normalizedPhone)) {
      summary.duplicateInFile += 1;
      rows.push({ ...dasar, customerId: null, customerName: null, clusterCode: null, status: "DUPLICATE_IN_FILE" });
      continue;
    }
    sudahDilihat.add(row.normalizedPhone);

    const customer = customers.get(row.normalizedPhone);
    if (!customer) {
      // Nomor valid tapi tidak ada di Customers -> TIDAK membuat customer baru.
      summary.unmatched += 1;
      rows.push({ ...dasar, customerId: null, customerName: null, clusterCode: null, status: "UNMATCHED" });
      continue;
    }
    summary.matched += 1;

    const picId = row.pic ? pics.get(row.pic.toLowerCase()) ?? null : null;
    const sudahGrouped = customer.status === "GROUPED";

    if (!sudahGrouped) {
      summary.newMember += 1;
      rows.push({
        ...dasar,
        customerId: customer.customer_id,
        customerName: customer.customer_name,
        clusterCode: customer.cluster_code,
        status: "NEW_MEMBER",
      });
      writes.push({
        customerId: customer.customer_id,
        groupName: row.groupName,
        pic: picId,
        joinedAt: row.joinedAt,
        notes: row.notes,
        statusBerubah: true,
      });
      continue;
    }

    // Sudah GROUPED: hanya metadata yang mungkin berubah. Field KOSONG di file
    // TIDAK PERNAH menghapus nilai yang sudah ada.
    const changes: { field: string; before: string; after: string }[] = [];
    if (row.groupName && row.groupName !== (customer.group_name ?? "")) {
      changes.push({ field: "Nama Grup", before: customer.group_name ?? "—", after: row.groupName });
    }
    if (picId && picId !== customer.pic_user_id) {
      changes.push({ field: "PIC", before: customer.pic_name ?? "—", after: row.pic ?? "—" });
    }
    if (row.joinedAt && row.joinedAt !== (customer.joined_at ?? "")) {
      changes.push({ field: "Tanggal Masuk Grup", before: customer.joined_at ?? "—", after: row.joinedAt });
    }

    if (!changes.length) {
      summary.alreadyGrouped += 1;
      rows.push({
        ...dasar,
        customerId: customer.customer_id,
        customerName: customer.customer_name,
        clusterCode: customer.cluster_code,
        status: "ALREADY_GROUPED",
      });
      continue;
    }

    summary.updated += 1;
    rows.push({
      ...dasar,
      customerId: customer.customer_id,
      customerName: customer.customer_name,
      clusterCode: customer.cluster_code,
      status: "UPDATE",
      changes,
    });
    writes.push({
      customerId: customer.customer_id,
      groupName: row.groupName,
      pic: picId,
      joinedAt: row.joinedAt,
      notes: row.notes,
      // Sudah GROUPED sebelumnya -> input cluster tidak berubah.
      statusBerubah: false,
    });
  }

  return { rows, summary, writes };
}

export function resolveMapping(payload: GroupImportPayload): GroupColumnMapping {
  const headers = [...new Set(payload.rows.flatMap((row) => Object.keys(row.values)))];
  const otomatis = resolveColumnMapping(headers);
  // Pilihan manual user menang atas deteksi otomatis.
  const mapping: GroupColumnMapping = { ...otomatis, ...(payload.mapping as GroupColumnMapping) };
  if (!mapping.phone) {
    throw new GroupImportError(
      "Kolom No HP tidak ditemukan. Pilih kolom nomor HP secara manual sebelum melanjutkan."
    );
  }
  return mapping;
}

export async function previewGroupImport(payload: GroupImportPayload): Promise<GroupImportPreview> {
  const mapping = resolveMapping(payload);
  const { rows, summary } = await analyze(payload, mapping);
  return {
    summary,
    mapping,
    rows: rows.slice(0, PREVIEW_ROW_LIMIT),
    truncated: rows.length > PREVIEW_ROW_LIMIT,
  };
}

/**
 * Commit. Seluruh membership ditulis dalam SATU transaction — kalau gagal di
 * tengah, tidak ada setengah update yang tertinggal.
 *
 * Cluster: TIDAK dihitung ulang per baris. Hanya customer yang status grupnya
 * benar-benar BERUBAH (NEW_MEMBER) yang di-recalculate lewat fungsi existing
 * `recalculateClusterForCustomer`. Baris UPDATE (sudah GROUPED, hanya metadata
 * berubah) tidak menyentuh input cluster sama sekali, jadi tidak perlu dihitung
 * ulang. Rumus cluster tidak berubah sedikit pun.
 */
export async function commitGroupImport(payload: GroupImportPayload, actorUserId: number): Promise<GroupImportResult> {
  const mapping = resolveMapping(payload);
  const { summary, writes } = await analyze(payload, mapping);

  return withTransaction(async (client) => {
    const batch = await client.query<{ id: number }>(
      `INSERT INTO import_batches (source_type, filename, file_hash, status, total_rows, valid_rows,
         excluded_rows, needs_review_rows, uploaded_by, is_active)
       VALUES ('GROUP_LIST', $1, $2, 'COMPLETED', $3, $4, $5, 0, $6, false)
       RETURNING id`,
      [
        payload.filename,
        // Riwayat import grup boleh berulang untuk file yang sama (menandai
        // grup adalah operasi aditif, bukan sekali seumur hidup seperti
        // Database All), jadi hash dibuat unik per percobaan.
        `group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        summary.totalRows,
        summary.matched,
        // "Unmatched" = nomor valid tapi customer tidak ditemukan. Inilah angka
        // yang dibaca KPI "Unmatched Import".
        summary.unmatched,
        actorUserId,
      ]
    );
    const batchId = batch.rows[0]!.id;

    for (const write of writes) {
      // COALESCE: field kosong dari file TIDAK PERNAH menghapus metadata lama.
      await client.query(
        `INSERT INTO customer_group_memberships
           (customer_id, status, group_name, joined_at, pic_user_id, notes, source, source_batch_id, updated_at, updated_by)
         VALUES ($1, 'GROUPED', $2, $3::date, $4, $5, 'GROUP_IMPORT', $6, now(), $7)
         ON CONFLICT (customer_id) DO UPDATE SET
           status = 'GROUPED',
           group_name = COALESCE(EXCLUDED.group_name, customer_group_memberships.group_name),
           joined_at = COALESCE(EXCLUDED.joined_at, customer_group_memberships.joined_at),
           pic_user_id = COALESCE(EXCLUDED.pic_user_id, customer_group_memberships.pic_user_id),
           notes = COALESCE(EXCLUDED.notes, customer_group_memberships.notes),
           source = 'GROUP_IMPORT',
           source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by`,
        [write.customerId, write.groupName, write.joinedAt, write.pic, write.notes, batchId, actorUserId]
      );

      if (write.statusBerubah) {
        await client.query(
          `INSERT INTO customer_group_membership_history (customer_id, old_status, new_status, source, changed_by)
           SELECT $1, NULL, 'GROUPED', 'GROUP_IMPORT', $2`,
          [write.customerId, actorUserId]
        );
      }
    }

    // Cluster hanya untuk yang status grupnya benar-benar berubah.
    for (const write of writes.filter((w) => w.statusBerubah)) {
      await recalculateClusterForCustomer(client, write.customerId);
    }

    return { ...summary, batchId };
  });
}
