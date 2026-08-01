import { withTransaction } from "@/server/db/transaction";
import { recalculateClusterForCustomer } from "@/server/import/orchestrator";
import type { MembershipStatus } from "@/server/import/group-membership-resolver";

export interface UpdateMembershipInput {
  customerId: number;
  status: MembershipStatus;
  groupName: string | null;
  joinedAt: string | null;
  picUserId: number | null;
  notes: string | null;
  updatedByUserId: number;
}

export interface UpdateMembershipResult {
  clusterCode: string | null;
}

/**
 * Satu-satunya jalur tulis customer_group_memberships dari CRM. Transaction-safe:
 * upsert current + insert history + rekalkulasi cluster customer ini, semua atau
 * tidak sama sekali. Dipanggil dari API route (PATCH) dan Server Action UI —
 * keduanya lewat fungsi ini, tidak ada logic tulis yang terduplikasi.
 */
export async function updateMembership(input: UpdateMembershipInput): Promise<UpdateMembershipResult> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ status: MembershipStatus }>(
      "SELECT status FROM customer_group_memberships WHERE customer_id = $1",
      [input.customerId]
    );
    const oldStatus = existing.rows[0]?.status ?? null;

    await client.query(
      `INSERT INTO customer_group_memberships
         (customer_id, status, group_name, joined_at, pic_user_id, notes, source, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'CRM_MANUAL', now(), $7)
       ON CONFLICT (customer_id) DO UPDATE SET
         status = EXCLUDED.status,
         group_name = EXCLUDED.group_name,
         joined_at = EXCLUDED.joined_at,
         pic_user_id = EXCLUDED.pic_user_id,
         notes = EXCLUDED.notes,
         source = 'CRM_MANUAL',
         updated_at = now(),
         updated_by = EXCLUDED.updated_by`,
      [
        input.customerId,
        input.status,
        input.groupName,
        input.joinedAt,
        input.picUserId,
        input.notes,
        input.updatedByUserId,
      ]
    );

    await client.query(
      `INSERT INTO customer_group_membership_history
         (customer_id, old_status, new_status, source, changed_by)
       VALUES ($1, $2, $3, 'CRM_MANUAL', $4)`,
      [input.customerId, oldStatus, input.status, input.updatedByUserId]
    );

    const recalculated = await recalculateClusterForCustomer(client, input.customerId);
    return { clusterCode: recalculated?.clusterCode ?? null };
  });
}
