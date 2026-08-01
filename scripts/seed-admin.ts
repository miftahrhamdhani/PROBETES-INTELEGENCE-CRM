/**
 * Buat / reset user (tanpa registrasi publik). Idempoten by email.
 *   npm run db:seed:admin -- admin@probetes.id "Nama Admin" "password-min-8" ADMIN
 * Role: ADMIN | CRM | MANAGEMENT (default ADMIN).
 */
import { isUserRole, USER_ROLES } from "../src/lib/roles";
import { upsertUser } from "../src/server/auth/users";

const [email, name, password, roleArg = "ADMIN"] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error(
    'Usage: npm run db:seed:admin -- <email> "<nama>" "<password>" [ADMIN|CRM|MANAGEMENT]'
  );
  process.exit(1);
}
if (!isUserRole(roleArg)) {
  console.error(`Role tidak valid: ${roleArg}. Pilih salah satu: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

const user = await upsertUser({ email, name, password, role: roleArg });
console.log(`user siap: id=${user?.id} ${user?.email} role=${user?.role}`);
