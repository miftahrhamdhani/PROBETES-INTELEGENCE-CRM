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
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await findUserByEmail(parsed.data.email);
        // Selalu jalankan verify walau user tidak ada supaya timing tidak membocorkan
        // email mana yang terdaftar.
        const stored = user?.passwordHash ?? "scrypt:00:00";
        const ok = await verifyPassword(parsed.data.password, stored);
        if (!user || !user.active || !ok) return null;

        return { id: String(user.id), email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});

export { canAccessPath } from "@/lib/roles";
export { requireRole, requireSession } from "./guards";
