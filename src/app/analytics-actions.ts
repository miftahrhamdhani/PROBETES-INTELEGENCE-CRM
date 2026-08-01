"use server";

import {
  getDashboardSummary,
  getFrequencyAnalytics,
  getRetentionAnalytics,
  getRfmAnalytics,
  type DashboardDateFilter,
} from "@/server/analytics/queries";

export async function loadRetentionAnalytics() {
  return getRetentionAnalytics();
}

export async function loadFrequencyAnalytics() {
  return getFrequencyAnalytics();
}

export async function loadRfmAnalytics() {
  return getRfmAnalytics();
}

/** `filter` (opsional) hanya mempersempit "Nilai order" & trend bulanan —
 *  lihat catatan di getDashboardSummary (src/server/analytics/queries.ts). */
export async function loadDashboardSummary(filter?: DashboardDateFilter) {
  const [summary, frequency] = await Promise.all([getDashboardSummary(filter), getFrequencyAnalytics()]);
  return { ...summary, frequencyDistribution: frequency.distribution };
}
