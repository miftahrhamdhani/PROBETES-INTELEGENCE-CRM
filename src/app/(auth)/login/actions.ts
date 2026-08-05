"use server";

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
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: `Gagal masuk (${error.type || "AuthError"}): Email atau password salah` };
    }
    // Re-throw NEXT_REDIRECT dari next/navigation / NextAuth redirect
    throw error;
  }

  return null;
}


