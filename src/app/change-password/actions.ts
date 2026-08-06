"use server";

import { z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { changeOwnPassword, InvalidCurrentPasswordError } from "@/server/auth/users";
import { signOut } from "@/server/auth";

export type ChangePasswordState = { error: string } | null;

const schema = z
  .object({
    currentPassword: z.string().min(1, "Password lama wajib diisi"),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
    confirmPassword: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Konfirmasi password tidak cocok" });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newPassword"], message: "Password baru harus berbeda dari password lama" });
    }
  });

/**
 * Server action ganti password sendiri (docs prompt perbaikan §7). Setelah
 * berhasil, session di-sign-out paksa — JWT lama masih membawa
 * mustChangePassword=true sampai kedaluwarsa (maxAge 12 jam), jadi login
 * ulang wajib supaya token baru membaca status terbaru dari DB.
 */
export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireSession();
  const parsed = schema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }

  try {
    await changeOwnPassword(Number(user.id), parsed.data.currentPassword, parsed.data.newPassword);
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) {
      return { error: "Password lama tidak cocok" };
    }
    return { error: error instanceof Error ? error.message : "Gagal mengganti password" };
  }

  await signOut({ redirectTo: "/login" });
  return null;
}
