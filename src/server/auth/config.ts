import type { NextAuthConfig } from "next-auth";
import { isUserRole, LOGIN_PATH, type UserRole } from "@/lib/roles";

/**
 * Bagian config yang edge-safe: tanpa DB, tanpa scrypt. Dipakai middleware.
 * Provider credentials (butuh Node runtime) ditambahkan di ./index.ts.
 * Keputusan akses dibuat eksplisit di src/middleware.ts (bukan callback
 * `authorized`) supaya user yang sudah login tapi salah role tidak
 * dipantulkan ke /login.
 *
 * `secret` MENANDATANGANI session JWT — siapa pun yang tahu nilainya bisa
 * memalsukan session (termasuk role ADMIN) tanpa password sama sekali.
 * SENGAJA tidak ada fallback hardcoded (docs prompt perbaikan §7 "verifikasi
 * keamanan akun") — env var wajib diisi di setiap environment, termasuk
 * Vercel production.
 */
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!authSecret) {
  throw new Error(
    "AUTH_SECRET (atau NEXTAUTH_SECRET) belum diset — wajib untuk menandatangani session JWT. " +
      "Set environment variable ini sebelum menjalankan aplikasi (termasuk di Vercel production)."
  );
}

export const authConfig = {
  secret: authSecret,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: LOGIN_PATH },
  trustHost: true,

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
        token.sub = String(user.id ?? token.sub);
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = isUserRole(token.role) ? token.role : undefined;
      session.user.mustChangePassword = (token as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
