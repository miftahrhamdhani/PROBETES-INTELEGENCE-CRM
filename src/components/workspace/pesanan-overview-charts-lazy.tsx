"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recharts adalah dependency terbesar di halaman Overview. Dimuat lewat
 * `next/dynamic` supaya bundle-nya TIDAK ikut menghalangi hidrasi: kartu KPI,
 * filter tanggal, dan sidebar jadi interaktif lebih dulu, grafik menyusul.
 *
 * `ssr: false` disengaja — grafik tidak menambah konten yang perlu terindeks
 * (aplikasi internal di balik login) dan me-render Recharts di server hanya
 * memperbesar payload RSC untuk markup yang tetap dibuang saat hidrasi.
 * Wrapper ini client component karena `ssr: false` tidak sah dipakai langsung
 * dari Server Component di Next 15.
 */
const PesananOverviewCharts = dynamic(
  () => import("./pesanan-overview-charts").then((mod) => mod.PesananOverviewCharts),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        {[0, 1].map((index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[260px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    ),
  }
);

export { PesananOverviewCharts as PesananOverviewChartsLazy };
