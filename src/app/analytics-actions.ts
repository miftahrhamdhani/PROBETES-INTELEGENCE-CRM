"use server";

import { z } from "zod";
import {
  getDashboardSummary,
  getFrequencyAnalytics,
  getRetentionAnalytics,
  getRfmAnalytics,
} from "@/server/analytics/queries";
import { getDatasetContext, listActiveSources } from "@/server/analytics/dataset";
import { cachedAggregate } from "@/server/analytics/cache";
import { requireRole } from "@/server/auth/guards";

/**
 * Analytics AGREGAT (tanpa PII per-customer) — Dashboard/Cohort/Frequency/RFM
 * boleh untuk ketiga role sesuai matriks src/lib/roles.ts. Guard tetap dipasang
 * eksplisit supaya action tidak bisa dipanggil tanpa sesi: middleware menyaring
 * per-path, sedangkan action id Next.js global.
 */
const requireAnalyticsAccess = () => requireRole("ADMIN", "CRM", "MANAGEMENT");

const dashboardFilterSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional();

/**
 * Agregat di bawah ini di-cache ber-tag (src/server/analytics/cache.ts): isinya
 * hanya berubah saat import/mapping/membership/rekalkulasi, jadi tidak perlu
 * dihitung ulang tiap navigasi. Guard tetap dijalankan SEBELUM cache dibaca —
 * cache tidak pernah menggantikan authorization.
 */
export async function loadRetentionAnalytics() {
  await requireAnalyticsAccess();
  return cachedAggregate(["retention"], () => getRetentionAnalytics())();
}

export async function loadFrequencyAnalytics() {
  await requireAnalyticsAccess();
  return cachedAggregate(["frequency"], () => getFrequencyAnalytics())();
}

export async function loadRfmAnalytics() {
  await requireAnalyticsAccess();
  return cachedAggregate(["rfm"], () => getRfmAnalytics())();
}

/** `filter` (opsional) hanya mempersempit "Nilai order" & trend bulanan —
 *  lihat catatan di getDashboardSummary (src/server/analytics/queries.ts). */
export async function loadDashboardSummary(filter?: unknown) {
  await requireAnalyticsAccess();
  const parsed = dashboardFilterSchema.parse(filter);
  // Filter tanggal ikut jadi bagian cache key supaya periode berbeda tidak
  // pernah memakai hasil periode lain.
  const key = ["dashboard", parsed?.dateFrom ?? "-", parsed?.dateTo ?? "-"];
  return cachedAggregate(key, async () => {
    // Konteks dataset (batch aktif + as_of_date) diambil SEKALI lalu dibagi ke
    // kedua query — sebelumnya masing-masing menjalankan MAX(order_date) sendiri.
    const ctx = await getDatasetContext();
    const [summary, frequency, activeSources] = await Promise.all([
      getDashboardSummary(parsed, ctx),
      getFrequencyAnalytics(ctx),
      listActiveSources(),
    ]);
    return { ...summary, frequencyDistribution: frequency.distribution, activeSources };
  })();
}
