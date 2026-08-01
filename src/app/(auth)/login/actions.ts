"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { safeNextPath } from "@/lib/next-path";
import { signIn } from "@/server/auth";

export type LoginState = { error: string } | null;

/**
 * Server action tipis: validasi kredensial ada di provider (src/server/auth).
 *
 * Dipakai sebagai `<form action={...}>` — WAJIB, bukan hanya onSubmit JS: form
 * tanpa `action` fallback ke GET dan menaruh email+password di query string
 * kalau JS belum ter-hydrate.
 *
 * `redirect: false` + redirect sendiri: @auth/core hanya menghormati
 * callbackUrl absolut dan membuang path relatif (user selalu dilempar ke "/"),
 * jadi tujuan setelah login ditentukan di sini saja.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const target = safeNextPath(String(formData.get("next") ?? "/"));

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email atau password salah, atau akun tidak aktif" };
    }
    throw error;
  }

  redirect(target); // di luar try: NEXT_REDIRECT tidak boleh tertelan catch
}
