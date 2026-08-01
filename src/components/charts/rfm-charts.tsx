"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MONETARY_BUCKETS, RECENCY_BUCKETS, type RfmDistributionItem } from "@/lib/analytics-types";

const tooltipStyle = { borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", fontSize: 12 };

/** Klik bar navigasi ke /customers dengan rentang recency/monetary bucket terkait. */
export function RfmBarChart({ kind, data }: { kind: "recency" | "monetary"; data: RfmDistributionItem[] }) {
  const router = useRouter();
  const buckets = kind === "recency" ? RECENCY_BUCKETS : MONETARY_BUCKETS;

  function handleClick(bucketLabel: string) {
    const bucket = buckets.find((b) => b.label === bucketLabel);
    if (!bucket) return;
    const params = new URLSearchParams();
    if (kind === "recency") {
      params.set("recencyMin", String(bucket.min));
      if (bucket.max !== null) params.set("recencyMax", String(bucket.max));
    } else {
      params.set("monetaryMin", String(bucket.min));
      if (bucket.max !== null) params.set("monetaryMax", String(bucket.max));
    }
    router.push(`/customers?${params.toString()}`);
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data.map((d) => ({ bucket: d.bucket, value: d.customers }))} margin={{ top: 12, right: 8, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString("id-ID"), "Customer"]} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar
          dataKey="value"
          fill={kind === "recency" ? "var(--series-aqua)" : "var(--series-orange)"}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          cursor="pointer"
          onClick={(entry) => handleClick(String(entry.bucket))}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
