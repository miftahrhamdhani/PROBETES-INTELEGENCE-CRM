/** SHARED — kontrak halaman Users (ADMIN). Tanpa I/O, tanpa React. */
import { z } from "zod";
import { USER_ROLES } from "./roles";

/** Password minimum disamakan dengan hashPassword() di src/server/auth/password.ts. */
export const MIN_PASSWORD_LENGTH = 8;

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`)
  .max(200);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Format email tidak valid").max(255),
  name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  role: z.enum(USER_ROLES),
  password,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  role: z.enum(USER_ROLES),
});

export const setUserActiveSchema = z.object({ active: z.boolean() });

export const resetPasswordSchema = z.object({ password });

/** Baris daftar user. Password/hash TIDAK PERNAH ada di tipe ini. */
export type UserAdminRow = {
  id: number;
  email: string;
  name: string;
  role: (typeof USER_ROLES)[number];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type UserHistoryEntry = {
  id: number;
  action: string;
  detail: Record<string, unknown>;
  changedBy: string | null;
  changedAt: string;
};

export const USER_ACTION_LABELS: Record<string, string> = {
  CREATE: "Akun dibuat",
  UPDATE_PROFILE: "Nama diubah",
  UPDATE_ROLE: "Role diubah",
  ACTIVATE: "Diaktifkan",
  DEACTIVATE: "Dinonaktifkan",
  RESET_PASSWORD: "Password direset",
};
