import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Flat config (ESLint 9). `next/core-web-vitals` + `next/typescript` dibawa lewat
 * FlatCompat karena eslint-config-next masih berbentuk eslintrc.
 *
 * Aturan tambahan di bawah menjaga batas arsitektur CLAUDE.md yang selama ini
 * hanya konvensi tertulis:
 *   - src/server/** tidak boleh mengimpor React/Next-client/komponen UI
 *   - src/components/** dan page.tsx tidak boleh mengimpor src/server/db langsung
 */
const config = [
  // next-env.d.ts digenerate Next.js setiap build — bukan source yang kita tulis.
  { ignores: [".next/**", "node_modules/**", "artifacts/**", "src/server/db/migrations/**", "next-env.d.ts"] },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/server/** harus bisa dites tanpa render (CLAUDE.md)." },
            { name: "next/navigation", message: "src/server/** tidak boleh bergantung router." },
          ],
          patterns: [
            { group: ["@/components/*", "**/components/*"], message: "Backend tidak boleh mengimpor komponen UI." },
          ],
        },
      ],
    },
  },

  /**
   * Pengecualian sempit: guards.ts memakai React `cache()` untuk memoization
   * PER-REQUEST saat memeriksa status aktif user ke DB (tanpa itu, satu halaman
   * dengan beberapa Server Action menjalankan query yang sama berkali-kali).
   * `cache()` bukan rendering dan tidak membawa JSX — backend tetap bisa dites.
   */
  {
    files: ["src/server/auth/guards.ts", "src/server/analytics/dataset.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    files: ["src/components/**/*.tsx", "src/components/**/*.ts", "src/app/**/page.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*"],
              message: "Akses data lewat Server Action / route handler, bukan langsung ke DB (CLAUDE.md).",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["tests/**/*.ts", "scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default config;
