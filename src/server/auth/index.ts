import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./config";
import { verifyPassword } from "./password";
import { findUserByEmail } from "./users";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Instance penuh (Node runtime): credentials + lookup Neon.
 * Tanpa registrasi publik — user dibuat admin lewat `npm run db:seed:admin`.
 *
 * SENGAJA tidak ada password/akun bypass hardcoded apa pun (docs prompt
 * perbaikan §7) — versi sebelumnya sempat punya "emergency admin fallback"
 * dan magic password universal yang aktif untuk SETIAP akun aktif; itu
 * backdoor otentikasi, bukan fitur resilience, dan sudah dihapus total.
 * Root cause asli (koneksi Neon serverless) sudah diperbaiki di commit
 * "sanitize DATABASE_URL query parameters" — kegagalan DB sekarang berarti
 * login gagal, bukan diam-diam menerima password apa pun.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const emailInput = parsed.data.email.trim().toLowerCase();
        const passInput = parsed.data.password;

        let user: Awaited<ReturnType<typeof findUserByEmail>>;
        try {
          user = await findUserByEmail(emailInput);
        } catch (err) {
          console.error("Auth DB Error:", err);
          throw err;
        }
        if (!user || !user.active) return null;
        const ok = await verifyPassword(passInput, user.passwordHash);
        if (!ok) return null;
        return { id: String(user.id), email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword };
      },
    }),
  ],
});


export { canAccessPath } from "@/lib/roles";
export { requireRole, requireSession } from "./guards";
