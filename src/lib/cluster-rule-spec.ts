/**
 * SHARED — ambang batas & spesifikasi aturan cluster.
 *
 * SATU-SATUNYA definisi angka ambang di seluruh project: `src/server/cluster/types.ts`
 * me-re-export dari sini, dan halaman /rules membacanya dari sini juga. Jadi
 * halaman Cluster Rules TIDAK PERNAH menampilkan salinan angka yang bisa
 * menyimpang dari yang benar-benar dipakai engine.
 *
 * Sumber aturan: docs/02-CLUSTER-RULES.md — IMMUTABLE. Mengubah nilai di sini
 * berarti mengubah aturan perusahaan; butuh persetujuan pemilik proses bisnis.
 */
import { CLUSTER_LABELS, CLUSTER_PRIORITY, RULE_VERSION, type ClusterCode } from "./cluster-codes";

export const A1_MONETARY_THRESHOLD = 1_500_000n;
/** ">" 5, artinya >= 6. Lihat docs/02-CLUSTER-RULES.md §5 (B). */
export const CLUSTER_B_MIN_YACONA_FREQ = 5;
export const LIFECYCLE_START_DATE = "2025-11-01";
export const E_WINDOW_START = "2025-03-01";
export const E_WINDOW_END = "2025-10-31";
export const D_NEW_MAX_AGE_DAYS = 15;

/** Tanggal berlakunya versi aturan ini (docs/08-RECONCILIATION.md). */
export const RULE_EFFECTIVE_FROM = "2025-01-01";

export type ClusterRuleSpec = {
  code: ClusterCode;
  label: string;
  priority: number;
  /** Ringkas, bahasa bisnis. */
  summary: string;
  /** Syarat yang harus terpenuhi — ditulis persis seperti yang dievaluasi engine. */
  conditions: string[];
  /** Hal yang membuat customer TIDAK masuk cluster ini walau syarat di atas terpenuhi. */
  exclusions: string[];
  /** File implementasi — supaya bisa ditelusuri dari halaman ke kode. */
  source: string;
};

const rupiah = (value: bigint) => `Rp ${value.toLocaleString("id-ID")}`;

/**
 * Urutan array = urutan evaluasi FIRST MATCH WINS, diturunkan dari
 * CLUSTER_PRIORITY (bukan diketik ulang).
 */
export const CLUSTER_RULE_SPECS: ClusterRuleSpec[] = (
  [
    {
      code: "B",
      summary: "Pelanggan lini KSB/Yacona yang sangat sering — menang atas seluruh cluster lain.",
      conditions: [`yacona_frequency > ${CLUSTER_B_MIN_YACONA_FREQ} (artinya >= ${CLUSTER_B_MIN_YACONA_FREQ + 1})`],
      exclusions: ["Dihitung dari dataset KSB terpisah (ksb_transactions), bukan dari order Probetes."],
      source: "src/server/cluster/rules/b.ts",
    },
    {
      code: "A1",
      summary: "Pelanggan bernilai tinggi yang sudah berulang.",
      conditions: ["frequency >= 2", `monetary >= ${rupiah(A1_MONETARY_THRESHOLD)} (nilai tepat termasuk A1)`],
      exclusions: ["Customer Cluster B tidak pernah sampai ke sini (prioritas B lebih tinggi)."],
      source: "src/server/cluster/rules/a1.ts",
    },
    {
      code: "C_PRODIG",
      summary: "Pembeli produk digital sekali beli yang sudah masuk grup.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "frequency = 1",
        "first order mengandung Ebook/Buku",
        "first order TIDAK mengandung HP/Amandia",
        "has_group = true",
      ],
      exclusions: ["Belum masuk grup -> jatuh ke D-New/D-Old."],
      source: "src/server/cluster/rules/c-prodig.ts",
    },
    {
      code: "C_HP",
      summary: "Pembeli herbal/Amandia sekali beli yang sudah masuk grup.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "frequency = 1",
        "first order mengandung HP/Amandia",
        "has_group = true",
      ],
      exclusions: ["Belum masuk grup -> jatuh ke Dhp-New/Dhp-Old."],
      source: "src/server/cluster/rules/c-hp.ts",
    },
    {
      code: "C_F2",
      summary: "Dua kali beli Ebook murni dan sudah masuk grup.",
      conditions: ["frequency = 2", "order 1 = Ebook murni", "order 2 = Ebook murni", "has_group = true"],
      exclusions: ["Tidak ada batas tanggal pada C-F2 (sesuai teks aturan)."],
      source: "src/server/cluster/rules/c-f2.ts",
    },
    {
      code: "D_NEW",
      summary: "Pembeli digital baru yang belum masuk grup, masih dalam masa awal.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "has_group = false",
        "(frequency = 1 DAN first order = Ebook murni) ATAU (frequency = 2 DAN order 1 & 2 Ebook murni)",
        `customer_age_days <= ${D_NEW_MAX_AGE_DAYS}`,
      ],
      exclusions: [`Hari ke-${D_NEW_MAX_AGE_DAYS} masih D-New; hari ke-${D_NEW_MAX_AGE_DAYS + 1} jadi D-Old.`],
      source: "src/server/cluster/rules/d.ts",
    },
    {
      code: "D_OLD",
      summary: "Sama dengan D-New tetapi sudah melewati masa awal.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "has_group = false",
        "(frequency = 1 DAN first order = Ebook murni) ATAU (frequency = 2 DAN order 1 & 2 Ebook murni)",
        `customer_age_days > ${D_NEW_MAX_AGE_DAYS}`,
      ],
      exclusions: [],
      source: "src/server/cluster/rules/d.ts",
    },
    {
      code: "DHP_NEW",
      summary: "Pembeli herbal/Amandia sekali beli, belum masuk grup, bulan berjalan.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "frequency = 1",
        "first order mengandung HP/Amandia",
        "has_group = false",
        "bulan(first_order_date) = bulan(as_of_date)",
      ],
      exclusions: [],
      source: "src/server/cluster/rules/dhp.ts",
    },
    {
      code: "DHP_OLD",
      summary: "Sama dengan Dhp-New tetapi first order-nya di bulan sebelumnya.",
      conditions: [
        `first_order_date >= ${LIFECYCLE_START_DATE}`,
        "frequency = 1",
        "first order mengandung HP/Amandia",
        "has_group = false",
        "bulan(first_order_date) < bulan(as_of_date)",
      ],
      exclusions: [],
      source: "src/server/cluster/rules/dhp.ts",
    },
    {
      code: "A2",
      summary: "Dua kali beli, nilai belum mencapai ambang A1.",
      conditions: ["frequency = 2", `monetary < ${rupiah(A1_MONETARY_THRESHOLD)}`],
      exclusions: ["Tidak match C-F2 / D lebih dulu (keduanya berprioritas lebih tinggi)."],
      source: "src/server/cluster/rules/a2.ts",
    },
    {
      code: "A3",
      summary: "Tiga kali beli, nilai belum mencapai ambang A1.",
      conditions: ["frequency = 3", `monetary < ${rupiah(A1_MONETARY_THRESHOLD)}`],
      exclusions: ["Tidak match prioritas sebelumnya."],
      source: "src/server/cluster/rules/a3.ts",
    },
    {
      code: "A4",
      summary: "Empat kali beli atau lebih, nilai belum mencapai ambang A1.",
      conditions: ["frequency >= 4", `monetary < ${rupiah(A1_MONETARY_THRESHOLD)}`],
      exclusions: ["Tidak match prioritas sebelumnya."],
      source: "src/server/cluster/rules/a4.ts",
    },
    {
      code: "E",
      summary: "Pembeli Ebook lama yang tidak pernah berpindah ke produk fisik.",
      conditions: [
        `first_order_date antara ${E_WINDOW_START} dan ${E_WINDOW_END}`,
        "first order = Ebook",
        "customer TIDAK PERNAH membeli produk fisik target",
      ],
      exclusions: [
        "Teks aturan tidak membatasi frequency. Karena posisinya setelah A2/A3/A4, " +
          "F>=2 sudah terserap duluan sehingga efektif hanya F=1 yang sampai ke sini — " +
          "ini akibat urutan evaluasi, BUKAN syarat tambahan.",
      ],
      source: "src/server/cluster/rules/e.ts",
    },
    {
      code: "F",
      summary: "Penampung akhir: tidak match cluster mana pun di atas.",
      conditions: ["Tidak match B, A1–A4, C, D, Dhp, maupun E"],
      exclusions: [
        "NEEDS_REVIEW, YACONA_NON_COHORT, dan EXCLUDED_NO_PHONE BUKAN cluster dan tidak pernah dibuang ke F.",
      ],
      source: "src/server/cluster/rules/f.ts",
    },
  ] satisfies Array<Omit<ClusterRuleSpec, "priority" | "label">>
)
  .map((spec) => ({ ...spec, label: CLUSTER_LABELS[spec.code], priority: CLUSTER_PRIORITY[spec.code] }))
  .sort((a, b) => a.priority - b.priority);

/** Status yang BUKAN cluster — ditampilkan terpisah supaya tidak tercampur 14 cluster resmi. */
export const NON_CLUSTER_SPECS = [
  {
    code: "NEEDS_REVIEW" as const,
    summary: "Customer valid, tetapi keputusan cluster-nya bergantung data yang belum pasti.",
    conditions: [
      "Order penentu mengandung produk UNKNOWN (frequency <= 2), ATAU",
      "status grup UNKNOWN padahal bentuk datanya membuat GROUPED vs NOT_GROUPED berbeda hasil",
    ],
    resolution: "Selesaikan lewat Product Mapping atau keputusan membership, lalu cluster dihitung ulang.",
  },
  {
    code: "YACONA_NON_COHORT" as const,
    summary: "Hanya punya transaksi KSB, tidak pernah membeli Probetes, dan belum memenuhi ambang Cluster B.",
    conditions: [`Tidak ada order Probetes`, `yacona_frequency <= ${CLUSTER_B_MIN_YACONA_FREQ}`],
    resolution: "Bukan bagian cohort Probetes. Tidak masuk RFM/Cohort/Frequency.",
  },
  {
    code: "EXCLUDED_NO_PHONE" as const,
    summary: "Baris sumber tanpa No. HP valid — tidak pernah menjadi canonical customer.",
    conditions: ["No. HP kosong / invalid / tidak dapat diperbaiki"],
    resolution: "Import Exclusion. Diperiksa di halaman Data Quality, bukan di sini.",
  },
];

export const CLUSTER_RULE_METADATA = {
  version: RULE_VERSION,
  effectiveFrom: RULE_EFFECTIVE_FROM,
  evaluation: "FIRST MATCH WINS — dievaluasi berurutan menaik menurut priority, berhenti di match pertama.",
  document: "docs/02-CLUSTER-RULES.md",
};
