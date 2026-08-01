import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { customers } from "@/server/db/schema";
import { normalizePhone } from "@/server/normalize/phone";
import type { CustomerProfileHistoryEntry } from "@/lib/customer-types";

export class CustomerNotFoundError extends Error {}
export class InvalidPhoneError extends Error {}
export class PhoneAlreadyExistsError extends Error {}

export interface UpdateCustomerProfileInput {
  name?: string;
  address?: string | null;
  phone?: string;
}

/**
 * Koreksi data profil customer oleh CRM: nama, alamat, dan No HP. Ini bukan
 * "edit raw data" — staging_import_rows tidak pernah disentuh; ini koreksi
 * canonical layer untuk data yang salah input, tercatat di
 * customer_profile_history (siapa/kapan/field apa berubah).
 *
 * No HP diizinkan diedit (surrogate id `customers.id` tetap jadi anchor
 * identitas untuk orders/ksb_transactions/membership — FK-nya tidak berubah),
 * TAPI dua hal wajib dijaga di sini:
 *  1. Nomor baru harus unik (tidak dipakai customer lain) — divalidasi & dicek
 *     eksplisit, bukan cuma mengandalkan unique constraint DB.
 *  2. ksb_transactions.customer_phone (kolom teks, dipakai rebuildRfm untuk
 *     join yacona_frequency PER TEKS, bukan customer_id) wajib ikut di-update,
 *     supaya import berikutnya tidak "kehilangan" frekuensi KSB customer ini
 *     akibat teks nomor lama vs normalized_phone baru sudah tidak cocok lagi.
 */
export async function updateCustomerProfile(
  customerId: number,
  input: UpdateCustomerProfileInput,
  userId: number
): Promise<void> {
  let normalizedPhone: string | undefined;
  if (input.phone !== undefined) {
    const result = normalizePhone(input.phone);
    if (result.status !== "VALID") {
      throw new InvalidPhoneError(
        result.status === "MISSING" ? "Nomor HP wajib diisi" : `Format nomor HP tidak valid (${result.reason})`
      );
    }
    normalizedPhone = result.normalized;
  }

  await withTransaction(async (client) => {
    const current = await client.query<{
      name: string | null;
      address: string | null;
      normalized_phone: string;
      display_phone: string | null;
    }>(
      "SELECT name, address, normalized_phone, display_phone FROM customers WHERE id = $1 FOR UPDATE",
      [customerId]
    );
    const row = current.rows[0];
    if (!row) throw new CustomerNotFoundError();

    if (normalizedPhone && normalizedPhone !== row.normalized_phone) {
      const conflict = await client.query<{ id: number }>(
        "SELECT id FROM customers WHERE normalized_phone = $1 AND id <> $2 LIMIT 1",
        [normalizedPhone, customerId]
      );
      if (conflict.rows[0]) {
        throw new PhoneAlreadyExistsError("Nomor HP ini sudah dipakai customer lain — tidak bisa dipakai dua kali.");
      }
    }

    const set: string[] = [];
    const values: unknown[] = [];
    const historyRows: { field: "name" | "address" | "phone"; oldValue: string | null; newValue: string | null }[] = [];

    if (input.name !== undefined && input.name !== (row.name ?? "")) {
      values.push(input.name);
      set.push(`name = $${values.length}`);
      historyRows.push({ field: "name", oldValue: row.name, newValue: input.name });
    }
    if (input.address !== undefined) {
      const nextAddress = input.address?.trim() || null;
      if (nextAddress !== row.address) {
        values.push(nextAddress);
        set.push(`address = $${values.length}`);
        historyRows.push({ field: "address", oldValue: row.address, newValue: nextAddress });
      }
    }
    if (normalizedPhone && normalizedPhone !== row.normalized_phone) {
      values.push(normalizedPhone);
      set.push(`normalized_phone = $${values.length}`);
      values.push(input.phone);
      set.push(`display_phone = $${values.length}`);
      historyRows.push({ field: "phone", oldValue: row.display_phone ?? row.normalized_phone, newValue: normalizedPhone });
    }

    if (set.length === 0) return; // Tidak ada perubahan nyata — hindari INSERT history kosong.

    values.push(customerId);
    await client.query(`UPDATE customers SET ${set.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);

    if (normalizedPhone && normalizedPhone !== row.normalized_phone) {
      await client.query("UPDATE ksb_transactions SET customer_phone = $1 WHERE customer_id = $2", [
        normalizedPhone,
        customerId,
      ]);
    }

    for (const h of historyRows) {
      await client.query(
        `INSERT INTO customer_profile_history (customer_id, field, old_value, new_value, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [customerId, h.field, h.oldValue, h.newValue, userId]
      );
    }
  });
}

export async function listCustomerProfileHistory(customerId: number): Promise<CustomerProfileHistoryEntry[]> {
  const result = await getDb().execute<{
    id: number;
    field: "name" | "address" | "phone";
    old_value: string | null;
    new_value: string | null;
    changed_by_name: string | null;
    changed_at: string;
  }>(sql`
    SELECT h.id, h.field, h.old_value, h.new_value, u.name AS changed_by_name, h.changed_at::text AS changed_at
    FROM customer_profile_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.customer_id = ${customerId}
    ORDER BY h.changed_at DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedByName: row.changed_by_name,
    changedAt: row.changed_at,
  }));
}

/** Soft delete operasional — lihat catatan di buildConditions (analytics/customers.ts):
 *  TIDAK memengaruhi RFM/Cohort/Frequency/Cluster, hanya menyembunyikan dari list. */
export async function setCustomerArchived(
  customerId: number,
  archived: boolean,
  userId: number
): Promise<void> {
  const db = getDb();
  const result = await db
    .update(customers)
    .set({
      archivedAt: archived ? new Date() : null,
      archivedBy: archived ? userId : null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning({ id: customers.id });
  if (!result[0]) throw new CustomerNotFoundError();
}
