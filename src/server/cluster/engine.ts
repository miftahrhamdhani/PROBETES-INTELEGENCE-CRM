/**
 * Cluster rule engine — FIRST MATCH WINS.
 * Fungsi murni — tanpa I/O, tanpa Date.now(). Urutan CHAIN di bawah adalah
 * urutan prioritas TERVERIFIKASI dari kode sumber sistem lama. JANGAN diubah
 * tanpa membaca docs/02-CLUSTER-RULES.md §2 dan docs/08-RECONCILIATION.md.
 */

import type { ClusterAssignment, ClusterCheck, ClusterContext, ClusterRuleFn, CustomerFeatures } from "./types";
import {
  checkA1,
  checkA2,
  checkA3,
  checkA4,
  checkB,
  checkCF2,
  checkCHp,
  checkCProdig,
  checkD,
  checkDhp,
  checkE,
  checkF,
} from "./rules";

// B dan pengecekan "belum pernah beli Probetes sama sekali" dievaluasi terpisah
// SEBELUM chain ini — lihat assignCluster() di bawah.
const CHAIN_AFTER_A1: ClusterRuleFn[] = [
  checkCProdig,
  checkCHp,
  checkCF2,
  checkD,
  checkDhp,
  checkA2,
  checkA3,
  checkA4,
  checkE,
  checkF, // catch-all, selalu match
];

export function assignCluster(features: CustomerFeatures, ctx: ClusterContext): ClusterAssignment {
  // B dicek paling dulu (priority 10) — berlaku bahkan untuk customer yang
  // TIDAK PERNAH beli Probetes sama sekali (murni KSB), lihat docs §3.1.
  const bResult = checkB(features, ctx);
  if (bResult) return bResult;

  // Customer tanpa order Probetes sama sekali (frequency=0) tapi yaconaFrequency<=5
  // -> YACONA_NON_COHORT, BUKAN cluster F. Lihat docs/02-CLUSTER-RULES.md §6.
  if (features.frequency === 0) {
    return {
      clusterCode: "YACONA_NON_COHORT",
      ruleVersion: ctx.ruleVersion,
      asOfDate: ctx.asOfDate,
      reason: {
        matchedRule: "YACONA_NON_COHORT",
        priority: null,
        checks: [
          { label: "Tidak ada order Probetes (frequency = 0)", passed: true, actual: 0 },
          { label: "Yacona/KSB frequency <= 5", passed: true, actual: features.yaconaFrequency },
        ],
      },
    };
  }

  // A1 tidak bergantung produk. Produk UNKNOWN tidak boleh menahan assignment
  // high-value yang sudah pasti A1 (priority 20).
  const a1Result = checkA1(features, ctx);
  if (a1Result) return a1Result;

  // Setelah B/A1 gugur, UNKNOWN pada F1/F2 dapat mengubah C/D/Dhp/E/A2/F —
  // baik dari produk UNKNOWN maupun status grup UNKNOWN (lihat features.ts).
  if (features.needsReview) {
    const checks: ClusterCheck[] = [];
    if (features.needsReviewReasons.includes("PRODUCT_UNKNOWN")) {
      checks.push({
        label: "Order yang menentukan cluster mengandung produk UNKNOWN",
        passed: true,
        actual: null,
      });
    }
    if (features.needsReviewReasons.includes("GROUP_UNKNOWN")) {
      checks.push({
        label: "Status grup belum diputuskan CRM (UNKNOWN) dan menentukan cluster (C-Prodig/C-HP/C-F2 vs D/Dhp)",
        passed: true,
        actual: "UNKNOWN",
      });
    }
    return {
      clusterCode: "NEEDS_REVIEW",
      ruleVersion: ctx.ruleVersion,
      asOfDate: ctx.asOfDate,
      reason: {
        matchedRule: "NEEDS_REVIEW",
        priority: null,
        checks,
      },
    };
  }

  for (const rule of CHAIN_AFTER_A1) {
    const result = rule(features, ctx);
    if (result) return result;
  }

  // Tidak akan pernah sampai sini karena checkF selalu match — kalau terjadi, itu bug.
  throw new Error("Cluster engine: tidak ada rule yang cocok termasuk F (bug pada chain)");
}
