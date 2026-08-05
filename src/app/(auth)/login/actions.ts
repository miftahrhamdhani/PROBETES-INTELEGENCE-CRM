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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: target,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { error: `Gagal masuk (${error.type || "AuthError"}): Email atau password salah` };
    }
    // Re-throw NEXT_REDIRECT dari next/navigation / NextAuth redirect
    throw error;
  }

  return null;
}

