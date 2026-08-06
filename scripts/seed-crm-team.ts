/**
 * Seed user CRM awal (docs prompt §6.3.5/§9.4) — Leader/SPV/Direktur/anggota CRM
 * diidentifikasi dari NAMA persis (lihat src/lib/workspace-cost-workflow.ts).
 * Tanpa baris ini, combobox "Nama CRM" di Pesanan kosong dan approval chain
 * Biaya Operasional tidak bisa jalan sama sekali (tidak ada user yang namanya
 * cocok Leader/SPV/Direktur).
 *
 * Keamanan credential (docs prompt perbaikan §7):
 * - TIDAK ADA password bersama — setiap user baru dapat password acak sendiri.
 * - Password baru TIDAK PERNAH dicetak ke console/log. Ditulis SEKALI ke file
 *   lokal gitignored (`*.credentials.local.json`), untuk diambil admin lalu
 *   dihapus. Hilangkan file itu setelah credential diserahkan ke masing-masing
 *   user.
 * - `must_change_password = true` dipasang di setiap akun baru — enforced di
 *   src/server/auth/guards.ts (requireSession menolak akses selain
 *   /change-password sampai flag ini dilepas oleh user sendiri).
 * - Idempoten by email: user yang SUDAH ADA tidak pernah di-reset passwordnya
 *   oleh script ini (lihat syncUserProfile) — hanya nama/role yang disinkron.
 *
 *   npm run workspace:seed-crm-team
 */
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { findUserByEmail, syncUserProfile, upsertUser } from "../src/server/auth/users";

function generateTempPassword(): string {
  // 16 karakter random base64url + jaminan ada huruf besar, angka, dan simbol
  // supaya lolos kebijakan password umum tanpa harus ditebak/berpola.
  const random = crypto.randomBytes(12).toString("base64url");
  return `${random}-A9!`;
}

const team: { email: string; name: string }[] = [
  { email: "sarah.rahma@probetes.local", name: "Sarah Rahma Niyar" },
  { email: "anggi.ayu@probetes.local", name: "Anggi Ayu Lestari" },
  { email: "irmanda.dwi@probetes.local", name: "Irmanda Dwi Prasetyo" },
  { email: "feny.nuraini@probetes.local", name: "Feny Nuraini" }, // Leader CRM
  { email: "nimah.luthfianingsih@probetes.local", name: "Ni'mah Luthfianingsih" }, // SPV
  { email: "rahman.ariefdewantara@probetes.local", name: "Rahman Arief Dewantara" }, // Direktur
];

const newAccountCredentials: { email: string; name: string; tempPassword: string }[] = [];

for (const member of team) {
  const existing = await findUserByEmail(member.email);
  if (existing) {
    await syncUserProfile(member.email, { name: member.name, role: "CRM" });
    console.log(`user sudah ada, password TIDAK diubah: id=${existing.id} ${existing.email} (${member.name})`);
    continue;
  }
  const tempPassword = generateTempPassword();
  const user = await upsertUser({ email: member.email, name: member.name, password: tempPassword, role: "CRM", mustChangePassword: true });
  console.log(`user baru dibuat: id=${user?.id} ${user?.email} (${member.name}) — wajib ganti password saat login pertama`);
  newAccountCredentials.push({ email: member.email, name: member.name, tempPassword });
}

if (newAccountCredentials.length > 0) {
  const outPath = path.resolve(process.cwd(), "workspace-crm-team.credentials.local.json");
  writeFileSync(outPath, JSON.stringify(newAccountCredentials, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(`\n${newAccountCredentials.length} password sementara (unik per user, BUKAN shared) ditulis ke:`);
  console.log(`  ${outPath}`);
  console.log(`File ini gitignored — ambil isinya untuk diserahkan ke masing-masing user lalu HAPUS file-nya.`);
  console.log(`Setiap user WAJIB mengganti password sendiri saat login pertama (must_change_password aktif).`);
} else {
  console.log("\nTidak ada user baru — seluruh akun tim CRM sudah ada sebelumnya, password tidak diubah.");
}
