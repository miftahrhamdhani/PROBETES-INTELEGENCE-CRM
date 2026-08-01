/**
 * Konstanta cluster — SHARED antara backend (src/server/cluster) dan frontend (UI).
 * Tanpa I/O, tanpa React. Jangan pakai string literal untuk cluster code di tempat lain.
 *
 * Sumber aturan: docs/02-CLUSTER-RULES.md — IMMUTABLE, jangan ubah nilai/urutan
 * tanpa persetujuan pemilik proses bisnis.
 */

export const CLUSTER_CODES = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B",
  "C_PRODIG",
  "C_HP",
  "C_F2",
  "D_NEW",
  "D_OLD",
  "DHP_NEW",
  "DHP_OLD",
  "E",
  "F",
] as const;

export type ClusterCode = (typeof CLUSTER_CODES)[number];

/** Status non-cluster — TIDAK BOLEH ditampilkan sebagai bagian dari 14 cluster resmi. */
export const NON_CLUSTER_STATUSES = [
  "EXCLUDED_NO_PHONE",
  "YACONA_NON_COHORT",
  "NEEDS_REVIEW",
] as const;

export type NonClusterStatus = (typeof NON_CLUSTER_STATUSES)[number];

export type ClusterAssignmentCode = ClusterCode | NonClusterStatus;

export const CLUSTER_LABELS: Record<ClusterCode, string> = {
  A1: "A1",
  A2: "A2",
  A3: "A3",
  A4: "A4",
  B: "B",
  C_PRODIG: "C-Prodig",
  C_HP: "C-HP",
  C_F2: "C-F2",
  D_NEW: "D-New",
  D_OLD: "D-Old",
  DHP_NEW: "Dhp-New",
  DHP_OLD: "Dhp-Old",
  E: "E",
  F: "F",
};

export const NON_CLUSTER_LABELS: Record<NonClusterStatus, string> = {
  EXCLUDED_NO_PHONE: "Excluded (No Phone)",
  YACONA_NON_COHORT: "Yacona/KSB Non-Cohort",
  NEEDS_REVIEW: "Needs Review",
};

/** Urutan prioritas evaluasi — FIRST MATCH WINS. Lihat docs/02-CLUSTER-RULES.md §2. */
export const CLUSTER_PRIORITY: Record<ClusterCode, number> = {
  B: 10,
  A1: 20,
  C_PRODIG: 30,
  C_HP: 31,
  C_F2: 32,
  D_NEW: 40,
  D_OLD: 41,
  DHP_NEW: 50,
  DHP_OLD: 51,
  A2: 60,
  A3: 70,
  A4: 80,
  E: 90,
  F: 100,
};

export const RULE_VERSION = "1.0";
