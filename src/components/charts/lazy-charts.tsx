"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recharts adalah dependency terberat di aplikasi ini dan dipakai empat halaman
 * (Dashboard, Cluster, Frequency, RFM). Dimuat lewat `next/dynamic` supaya
 * bundle-nya tidak menghalangi hidrasi: KPI, filter, tabel, dan sidebar jadi
 * interaktif lebih dulu — grafiknya menyusul.
 *
 * `ssr: false` disengaja: aplikasi internal di balik login (tidak butuh
 * terindeks), dan me-render Recharts di server hanya memperbesar payload RSC
 * untuk markup SVG yang tetap dibuang saat hidrasi.
 *
 * Wrapper ini client component karena `ssr: false` tidak sah dipakai langsung
 * dari Server Component di Next 15. Placeholder memakai tinggi yang sama dengan
 * grafik aslinya supaya tidak ada layout shift saat chart selesai dimuat.
 */
function chartSkeleton(height: number) {
  return function ChartSkeleton() {
    return <Skeleton className="w-full" style={{ height }} />;
  };
}

export const RevenueTrendChart = dynamic(
  () => import("./overview-charts").then((m) => m.RevenueTrendChart),
  { ssr: false, loading: chartSkeleton(210) }
);

export const CustomerTrendChart = dynamic(
  () => import("./overview-charts").then((m) => m.CustomerTrendChart),
  { ssr: false, loading: chartSkeleton(210) }
);

export const FrequencyBarChart = dynamic(
  () => import("./overview-charts").then((m) => m.FrequencyBarChart),
  { ssr: false, loading: chartSkeleton(210) }
);

export const ClusterBarChart = dynamic(
  () => import("./overview-charts").then((m) => m.ClusterBarChart),
  { ssr: false, loading: chartSkeleton(240) }
);

export const RfmBarChart = dynamic(
  () => import("./rfm-charts").then((m) => m.RfmBarChart),
  { ssr: false, loading: chartSkeleton(210) }
);
