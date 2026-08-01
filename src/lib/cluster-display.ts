/**
 * SHARED — metadata TAMPILAN saja (deskripsi singkat + warna kartu) untuk
 * 14 cluster resmi. Bukan bagian dari aturan bisnis — aturan sesungguhnya
 * tetap di docs/02-CLUSTER-RULES.md dan src/server/cluster/rules/*.
 */
import type { ClusterCode } from "./cluster-codes";

export const CLUSTER_DISPLAY: Record<
  ClusterCode,
  { description: string; tone: "violet" | "blue" | "green" | "orange" | "slate" | "red" }
> = {
  A1: { description: "F2+ · Total ≥ Rp1,5 jt", tone: "violet" },
  A2: { description: "Tepat F2 · Belanja < Rp1,5 jt", tone: "blue" },
  A3: { description: "Tepat F3", tone: "blue" },
  A4: { description: "F4 ke atas", tone: "blue" },
  B: { description: "KSB frequency > 5", tone: "green" },
  C_PRODIG: { description: "F1 Ebook/Buku · Masuk Grup", tone: "blue" },
  C_HP: { description: "F1 HP/Amandia · Masuk Grup", tone: "blue" },
  C_F2: { description: "F2 Ebook · Masuk Grup", tone: "blue" },
  D_NEW: { description: "Ebook · Belum Grup · ≤15 hari", tone: "orange" },
  D_OLD: { description: "Ebook · Belum Grup · >15 hari", tone: "orange" },
  DHP_NEW: { description: "HP/Amandia · Bulan ini", tone: "orange" },
  DHP_OLD: { description: "HP/Amandia · Bulan lalu", tone: "orange" },
  E: { description: "Ebook Mar–Okt 2025", tone: "slate" },
  F: { description: "Data lama / lainnya", tone: "red" },
};
