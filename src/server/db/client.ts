import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum dikonfigurasi");
  return url;
}

/** Lazy supaya import fungsi murni/test tidak menuntut DATABASE_URL. */
export function getDb() {
  return drizzle(neon(getDatabaseUrl()), { schema });
}

export type Database = ReturnType<typeof getDb>;
