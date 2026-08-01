import type { NextAuthConfig } from "next-auth";
import { isUserRole, LOGIN_PATH, type UserRole } from "@/lib/roles";

/**
 * Bagian config yang edge-safe: tanpa DB, tanpa scrypt. Dipakai middleware.
 * Provider credentials (butuh Node runtime) ditambahkan di ./index.ts.
 * Keputusan akses dibuat eksplisit di src/middleware.ts (bukan callback
 * `authorized`) supaya user yang sudah login tapi salah role tidak
 * dipantulkan ke /login.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: LOGIN_PATH },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role;
        token.sub = String(user.id ?? token.sub);
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = isUserRole(token.role) ? token.role : undefined;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
