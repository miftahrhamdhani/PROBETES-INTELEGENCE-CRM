"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  fontSize: 12,
};

type TrendChartItem = { month: string; monthLabel: string; customers: number; revenue: number };

export function RevenueTrendChart({ data }: { data: readonly TrendChartItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={[...data]} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)} jt`} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} width={50} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(_label, payload) => payload[0]?.payload.month ?? ""} formatter={(value) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Nilai order"]} />
        <Line type="monotone" dataKey="revenue" name="Nilai order" stroke="var(--series-blue)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-blue)", stroke: "var(--chart-surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CustomerTrendChart({ data }: { data: readonly TrendChartItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={[...data]} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => Number(v).toLocaleString("id-ID")} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} width={42} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(_label, payload) => payload[0]?.payload.month ?? ""} formatter={(value) => [Number(value).toLocaleString("id-ID"), "Customer aktif"]} />
        <Line type="monotone" dataKey="customers" name="Customer aktif" stroke="var(--series-aqua)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-aqua)", stroke: "var(--chart-surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FrequencyBarChart({ data }: { data: readonly { bucket: string; customers: number }[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={[...data]} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => Number(v).toLocaleString("id-ID")} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} width={50} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString("id-ID"), "Customer"]} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar
          dataKey="customers"
          name="Customer"
          fill="var(--series-blue)"
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          cursor="pointer"
          onClick={(entry) => {
            const bucket = String(entry.bucket);
            router.push(bucket === "F5+" ? "/customers?frequencyMin=5" : `/customers?frequency=${bucket.slice(1)}`);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClusterBarChart({
  data,
  compact = false,
}: {
  data: Array<{ code: string; label: string; count: number }>;
  /** Versi ringkas untuk layout KPI-kiri/visualisasi-kanan di halaman Cluster. */
  compact?: boolean;
}) {
  const router = useRouter();
  const sorted = [...data].sort((a, b) => b.count - a.count);
  return (
    <ResponsiveContainer width="100%" height={compact ? 240 : 360}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 54, left: 16, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString("id-ID"), "Customer"]} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar
          dataKey="count"
          name="Customer"
          fill="var(--series-blue)"
          maxBarSize={compact ? 12 : 18}
          radius={[0, 4, 4, 0]}
          cursor="pointer"
          animationDuration={400}
          onClick={(entry) => router.push(`/cluster?cluster=${entry.code}`)}
          label={{ position: "right", fill: "var(--chart-axis)", fontSize: 10, formatter: (v: unknown) => Number(v).toLocaleString("id-ID") }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
