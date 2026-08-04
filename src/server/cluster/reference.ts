/** BACKEND — jumlah customer per kode cluster, untuk halaman Cluster Rules. */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { ClusterAssignmentCode } from "@/lib/cluster-codes";

export async function getClusterAssignmentCounts(): Promise<Partial<Record<ClusterAssignmentCode, number>>> {
  const result = await getDb().execute<{ cluster_code: ClusterAssignmentCode; total: string }>(sql`
    SELECT cluster_code, COUNT(*)::text AS total
    FROM customer_cluster_current
    GROUP BY cluster_code
  `);
  const counts: Partial<Record<ClusterAssignmentCode, number>> = {};
  for (const row of result.rows) counts[row.cluster_code] = Number(row.total);
  return counts;
}
