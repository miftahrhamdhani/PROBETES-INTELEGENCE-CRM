import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const FALLBACK_DATABASE_URL = "postgresql://neondb_owner:npg_cX8ht7VOIYHb@ep-winter-star-azarfhu7-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb";

function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    url = FALLBACK_DATABASE_URL;
  }
  return url
    .replace(/[\?&]channel_binding=[^&]*/g, "")
    .replace(/[\?&]sslmode=[^&]*/g, "")
    .replace(/\?$/, "");
}



/** Lazy supaya import fungsi murni/test tidak menuntut DATABASE_URL. */
export function getDb() {
  return drizzle(neon(getDatabaseUrl()), { schema });
}

export type Database = ReturnType<typeof getDb>;
