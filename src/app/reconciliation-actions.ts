"use server";

import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { getReconciliationReport } from "@/server/analytics/reconciliation";
import { listReconciliationCandidates, reviewReconciliation } from "@/server/workspace/reconciliation";

/** Reconciliation = ADMIN & MANAGEMENT (src/lib/roles.ts /reconciliation).
 *  Isinya agregat/jumlah saja, tanpa PII per-customer. */
export async function loadReconciliationReport() {
  await requireRole("ADMIN", "MANAGEMENT");
  return getReconciliationReport();
}

/**
 * Kandidat pencocokan laporan manual CRM <-> order official hasil import.
 * Pipeline import terus MEMBUAT baris `MATCH_CANDIDATE`; sebelumnya tidak ada
 * satu pun jalur UI untuk meninjaunya sehingga antrean hanya menumpuk.
 *
 * Berbeda dari laporan balance di atas, daftar ini memuat nama customer
 * (PII) — karena itu tetap dibatasi role yang sama dengan halamannya.
 */
export async function loadReconciliationCandidatesAction() {
  await requireRole("ADMIN", "MANAGEMENT");
  return listReconciliationCandidates();
}

const reviewSchema = z.object({
  id: z.coerce.number().int().positive(),
  decision: z.enum(["RECONCILED", "REJECTED"]),
  reason: z.string().trim().min(3, "Alasan wajib diisi").max(500),
});

/** Keputusan hanya bisa diterapkan sekali — service menolak kandidat yang
 *  statusnya sudah bukan MATCH_CANDIDATE (lihat InvalidReconciliationError). */
export async function reviewReconciliationAction(input: unknown) {
  const user = await requireRole("ADMIN", "MANAGEMENT");
  const body = reviewSchema.parse(input);
  await reviewReconciliation(body.id, body.decision, Number(user.id), body.reason);
}
