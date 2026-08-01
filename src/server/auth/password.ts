import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LEN = 64;
const PREFIX = "scrypt";

/** Format: `scrypt:<saltHex>:<hashHex>` — disimpan di users.password_hash. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password minimal 8 karakter");
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `${PREFIX}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, hashHex] = stored.split(":");
  if (prefix !== PREFIX || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LEN) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LEN);
  return timingSafeEqual(actual, expected);
}
