/**
 * Secret scanning — dijalankan di CI (lihat .github/workflows/ci.yml) dan bisa
 * dipakai lokal sebelum commit. TIDAK butuh dependency baru: hanya `git
 * ls-files` (otomatis menghormati .gitignore, jadi node_modules/.next/dsb
 * tidak pernah ikut discan) + regex bawaan Node.
 *
 * Mendeteksi:
 *   - connection string postgres://... / postgresql://... dengan kredensial
 *     literal (bukan placeholder/env var);
 *   - assignment password/secret/API key yang terlihat seperti nilai asli;
 *   - AUTH_SECRET/NEXTAUTH_SECRET yang di-hardcode (bukan process.env.*);
 *   - pola universal password / emergency admin bypass yang PERNAH jadi
 *     backdoor otentikasi di aplikasi ini (docs prompt perbaikan §7) — supaya
 *     tidak pernah muncul kembali secara diam-diam.
 *
 * Exit code 1 kalau ada temuan — dipakai CI untuk GAGALKAN build.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Finding = { file: string; line: number; rule: string; snippet: string };

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: "connection-string-with-credentials",
    // postgres(ql)://user:pass@host — literal password, bukan placeholder
    // umum ("user", "password", "xxxx") dan bukan interpolasi (${...}).
    pattern: /postgres(?:ql)?:\/\/(?!.*\$\{)[A-Za-z0-9_.-]+:(?!password|xxxx|xxx|changeme)[A-Za-z0-9_!@#$%^&*.-]{6,}@/i,
  },
  {
    name: "auth-secret-hardcoded",
    pattern: /\b(AUTH_SECRET|NEXTAUTH_SECRET)\s*[:=]\s*["'][^"'$][^"']{7,}["']/,
  },
  {
    name: "generic-secret-assignment",
    // `xxxSecret = "..."` / `apiKey: "..."` dengan nilai literal panjang —
    // sengaja tidak match `process.env.X` atau string kosong/pendek.
    pattern: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/i,
  },
  {
    name: "universal-password-backdoor",
    pattern: /\b(admin123|admin12345|universal[_-]?password|emergency[_-]?admin[_-]?(fallback|bypass)|password[_-]?bypass)\b/i,
  },
];

// File/baris yang secara SAH menyebut pola di atas (dokumentasi/placeholder/
// contoh/komentar historis) — dikecualikan dari deteksi supaya scanner tidak
// berteriak pada dirinya sendiri atau pada catatan "backdoor ini sudah dihapus".
const ALLOWLIST_FILES = new Set(["scripts/scan-secrets.ts", ".env.example"]);

function listTrackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: process.cwd(), encoding: "utf8" });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => /\.(ts|tsx|js|mjs|cjs|json|env.*|ya?ml|md)$/i.test(file) || file === ".env.example");
}

function scanFile(file: string): Finding[] {
  if (ALLOWLIST_FILES.has(file)) return [];
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return []; // symlink rusak/binary — lewati, bukan tanggung jawab scanner ini
  }
  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.name, snippet: line.trim().slice(0, 160) });
      }
    }
  }
  return findings;
}

const files = listTrackedFiles();
const findings = files.flatMap(scanFile);

if (findings.length === 0) {
  console.log(`Secret scan: 0 temuan pada ${files.length} file ter-track.`);
  process.exit(0);
}

console.error(`Secret scan: ${findings.length} temuan!\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}]\n    ${f.snippet}`);
}
console.error("\nKalau ini false positive (mis. dokumentasi/contoh), tambahkan file ke ALLOWLIST_FILES di scripts/scan-secrets.ts dengan alasan jelas.");
process.exit(1);
