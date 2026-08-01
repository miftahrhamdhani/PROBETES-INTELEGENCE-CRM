import { sql } from "drizzle-orm";
import type { ActiveDatasetInfo } from "@/lib/dataset-types";
import { getDb } from "@/server/db/client";

export async function getActiveDatasetInfo(): Promise<ActiveDatasetInfo> {
  const rows = await getDb().execute<{ source_type: string; as_of_date: string | null }>(sql`
    SELECT source_type::text, as_of_date::text
    FROM import_batches
    WHERE is_active = true
  `);
  const bySource = new Map(rows.rows.map((row) => [row.source_type, row]));
  return {
    asOfDate: bySource.get("DATABASE_ALL")?.as_of_date ?? null,
    databaseAllActive: bySource.has("DATABASE_ALL"),
    ksbActive: bySource.has("KSB"),
    groupListActive: bySource.has("GROUP_LIST"),
  };
}
