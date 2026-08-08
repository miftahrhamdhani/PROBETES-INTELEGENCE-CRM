/**
 * Import Data Grup — aturan yang menjaga import tetap AMAN:
 * tidak membuat customer, tidak menghapus member lama, idempotent, dan tidak
 * pernah menebak pemetaan kolom.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_IMPORT_STATUSES,
  GROUP_IMPORT_STATUS_LABELS,
  GROUP_IMPORT_WRITE_STATUSES,
  normalizeHeader,
  resolveColumnMapping,
} from "@/lib/group-import-contracts";

const SRC = readFileSync(resolve(process.cwd(), "src/server/membership/group-import.ts"), "utf8");

describe("Deteksi kolom", () => {
  it("mengenali alias umum kolom nomor HP", () => {
    for (const header of ["No HP", "no_hp", "NOMOR HP", "No. HP", "WhatsApp", "WA", "Phone"]) {
      expect(resolveColumnMapping([header]).phone, header).toBe(header);
    }
  });

  it("mengenali kolom opsional", () => {
    const mapping = resolveColumnMapping(["No HP", "Nama Customer", "Grup Konsultasi", "PIC", "Tanggal Masuk Grup", "Catatan"]);
    expect(mapping.customerName).toBe("Nama Customer");
    expect(mapping.groupName).toBe("Grup Konsultasi");
    expect(mapping.pic).toBe("PIC");
    expect(mapping.joinedAt).toBe("Tanggal Masuk Grup");
    expect(mapping.notes).toBe("Catatan");
  });

  it("TIDAK menebak kolom yang tidak dikenal", () => {
    const mapping = resolveColumnMapping(["Kolom A", "Kolom B"]);
    expect(mapping.phone).toBeUndefined();
  });

  it("normalizeHeader menyamakan variasi penulisan", () => {
    expect(normalizeHeader("No. HP")).toBe(normalizeHeader("no hp"));
    expect(normalizeHeader("Nama_Grup")).toBe(normalizeHeader("NAMA GRUP"));
  });

  it("kolom telepon tidak terdeteksi -> melempar error, bukan menebak", () => {
    expect(SRC).toContain("Kolom No HP tidak ditemukan");
  });
});

describe("Status import", () => {
  it("setiap status punya label", () => {
    for (const status of GROUP_IMPORT_STATUSES) expect(GROUP_IMPORT_STATUS_LABELS[status]).toBeTruthy();
  });

  it("hanya NEW_MEMBER & UPDATE yang menulis ke database", () => {
    expect([...GROUP_IMPORT_WRITE_STATUSES].sort()).toEqual(["NEW_MEMBER", "UPDATE"]);
  });
});

describe("Aturan keamanan import", () => {
  it("TIDAK PERNAH membuat customer baru", () => {
    expect(SRC).not.toMatch(/INSERT\s+INTO\s+customers/i);
  });

  it("TIDAK menyentuh order/transaksi/RFM/cohort", () => {
    expect(SRC).not.toMatch(/INSERT\s+INTO\s+orders/i);
    expect(SRC).not.toMatch(/customer_rfm_current/i);
    expect(SRC).not.toMatch(/rebuildRfm|rebuildClusters/);
  });

  it("NON-DESTRUKTIF: tidak pernah men-set NOT_GROUPED / menghapus membership", () => {
    expect(SRC).not.toMatch(/'NOT_GROUPED'/);
    expect(SRC).not.toMatch(/DELETE\s+FROM\s+customer_group_memberships/i);
  });

  it("field kosong di file tidak menghapus metadata lama (COALESCE)", () => {
    expect(SRC).toContain("COALESCE(EXCLUDED.group_name, customer_group_memberships.group_name)");
    expect(SRC).toContain("COALESCE(EXCLUDED.pic_user_id, customer_group_memberships.pic_user_id)");
    expect(SRC).toContain("COALESCE(EXCLUDED.joined_at, customer_group_memberships.joined_at)");
  });

  it("idempotent: upsert per customer (ON CONFLICT), bukan insert berulang", () => {
    expect(SRC).toContain("ON CONFLICT (customer_id) DO UPDATE");
  });

  it("memakai SSOT yang sama dengan aksi manual", () => {
    expect(SRC).toContain("customer_group_memberships");
    expect(SRC).toContain("customer_group_membership_history");
  });

  it("sumber ditandai GROUP_IMPORT (bukan menyamar jadi manual)", () => {
    expect(SRC).toContain("'GROUP_IMPORT'");
  });

  it("memakai normalizePhone existing, bukan normalizer kedua", () => {
    expect(SRC).toContain('from "@/server/normalize/phone"');
  });

  it("commit dibungkus satu transaction", () => {
    expect(SRC).toContain("withTransaction");
  });

  it("cluster hanya dihitung ulang untuk yang status grupnya BERUBAH", () => {
    expect(SRC).toContain("writes.filter((w) => w.statusBerubah)");
    expect(SRC).toContain("recalculateClusterForCustomer");
  });

  it("commit menghitung ulang klasifikasi sendiri (tidak percaya client)", () => {
    const commit = SRC.slice(SRC.indexOf("export async function commitGroupImport"));
    expect(commit).toContain("await analyze(payload, mapping)");
  });

  it("riwayat import dicatat lewat import_batches GROUP_LIST existing", () => {
    expect(SRC).toContain("INSERT INTO import_batches");
    expect(SRC).toContain("'GROUP_LIST'");
  });
});
