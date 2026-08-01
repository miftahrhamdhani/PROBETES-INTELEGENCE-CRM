import { z } from "zod";

/**
 * Koreksi data yang diizinkan CRM: nama, alamat, No HP. Tidak ada create-customer
 * manual — lihat catatan di src/app/customers-actions.ts. Validasi format No HP
 * (normalisasi 628xxxxxxxxx, cek duplikat) dilakukan di service layer lewat
 * normalizePhone() yang sama dipakai pipeline import — bukan di sini, supaya
 * satu sumber kebenaran.
 */
export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().min(5).max(30).optional(),
});
export type UpdateCustomerProfileBody = z.infer<typeof updateCustomerProfileSchema>;
