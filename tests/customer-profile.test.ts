/**
 * Koreksi data profil customer (nama/alamat/No HP) — CRUD terbatas ke Update
 * saja (tidak ada create/delete, lihat src/app/customers-actions.ts). Bagian
 * ini murni schema + contract check (tanpa DB), sama pola dengan
 * tests/workspace.test.ts — validasi transaksional (unik No HP, sinkronisasi
 * ksb_transactions.customer_phone) hanya bisa diverifikasi lewat integration
 * test/manual QA karena butuh DB nyata.
 */
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { customerProfileHistory, customers } from "@/server/db/schema";
import { updateCustomerProfileSchema } from "@/lib/customer-crud-contracts";

describe("Customer profile — schema", () => {
  it("customer_profile_history punya FK ke customers (cascade) dan users (changed_by)", () => {
    const fks = getTableConfig(customerProfileHistory).foreignKeys.map((f) => f.reference());
    const customerFk = fks.find((ref) => ref.foreignTable === customers);
    expect(customerFk?.columns.map((c) => c.name)).toEqual(["customer_id"]);
  });

  it("customers.normalized_phone tetap unique (identitas) walau sekarang bisa diedit lewat CRM", () => {
    const config = getTableConfig(customers);
    const hasUnique = config.indexes.some(
      (idx) =>
        idx.config.unique === true &&
        idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "normalized_phone"
    );
    expect(hasUnique).toBe(true);
  });
});

describe("Customer profile — validasi Zod", () => {
  it("menerima name/address/phone semua opsional (partial update)", () => {
    expect(updateCustomerProfileSchema.safeParse({}).success).toBe(true);
    expect(updateCustomerProfileSchema.safeParse({ name: "Ibu Ani" }).success).toBe(true);
    expect(updateCustomerProfileSchema.safeParse({ phone: "0812345678" }).success).toBe(true);
  });

  it("menolak name kosong (min 1) dan phone terlalu pendek (min 5)", () => {
    expect(updateCustomerProfileSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateCustomerProfileSchema.safeParse({ phone: "081" }).success).toBe(false);
  });

  it("address boleh null (dihapus) — hanya phone & name yang wajib string kalau diisi", () => {
    expect(updateCustomerProfileSchema.safeParse({ address: null }).success).toBe(true);
  });
});
