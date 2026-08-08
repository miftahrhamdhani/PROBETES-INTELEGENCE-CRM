"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Box,
  Megaphone,
  ReceiptText,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PesananDetailSheet } from "@/components/workspace/pesanan-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRupiah, formatRupiahShort } from "@/lib/format";
import type { WorkspaceOrderStatus } from "@/lib/workspace-pesanan-contracts";
import type {
  ComCompositionRow,
  KpiComparison,
  LatestOrderRow,
  OverviewKpi,
  PaymentComposition,
  ProductDimensionRow,
  SalesSourceRow,
  StatusCompositionRow,
  TrendGranularity,
  TrendPoint,
  WorkspaceOverviewReadModel,
} from "@/server/workspace/pesanan-overview";
import { cn } from "@/lib/utils";

const COLORS = {
  green: "#22a85a",
  blue: "#3285e9",
  orange: "#f28b45",
  purple: "#7955d9",
  red: "#ef5b5b",
  amber: "#f2b643",
  cyan: "#38b9ca",
};

const STATUS_COLORS: Record<WorkspaceOrderStatus, string> = {
  DRAFT: "#f2b643",
  CONFIRMED: "#22a85a",
  CANCELLED: "#ef5b5b",
  RETURNED: "#3285e9",
  REFUNDED: "#38b9ca",
  PARTIALLY_REFUNDED: "#7955d9",
};

const STATUS_VARIANT: Record<WorkspaceOrderStatus, "outline" | "success" | "secondary" | "warning"> = {
  DRAFT: "outline",
  CONFIRMED: "success",
  CANCELLED: "secondary",
  RETURNED: "warning",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

const COM_LABEL: Record<string, string> = {
  BROADCAST: "Broadcast",
  MEKARI_QONTAK: "Mekari Qontak",
  WHATSAPP_API: "WhatsApp API",
  AI_CRM: "AI CRM",
  SOFTWARE_CRM: "Software CRM",
  CAMPAIGN_CRM: "Campaign CRM",
  DATABASE_LEADS: "Database Leads",
  SAMPLE_PROMOSI: "Sample Promosi",
  COM_LAINNYA: "COM Lainnya",
};

export function OverviewDashboard({ data }: { data: WorkspaceOverviewReadModel }) {
  const [granularity, setGranularity] = React.useState<TrendGranularity>("daily");
  const [detailId, setDetailId] = React.useState<number | null>(null);

  return (
    <div className="space-y-3">
      <OverviewKpiCards kpi={data.kpi} />

      <div className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
        <TrendCard trends={data.trends} granularity={granularity} onGranularityChange={setGranularity} />
        <FinancialSummary kpi={data.kpi} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <TopProductCard rows={data.topProducts} />
        <SalesSourceCard rows={data.salesBySource} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.8fr_1.15fr_1.15fr]">
        <PaymentCard rows={data.paymentComposition} gross={data.kpi.gross} />
        <StatusCard rows={data.statusComposition} />
        <ComCard rows={data.comComposition} com={data.kpi.com} />
      </div>

      <LatestOrdersCard rows={data.latestOrders} onOpen={setDetailId} />
      <PesananDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function OverviewKpiCards({ kpi }: { kpi: OverviewKpi }) {
  const cards = [
    { label: "Jumlah Customer", value: kpi.jumlahCustomer.toLocaleString("id-ID"), icon: Users, tone: "green", comparison: kpi.comparison.jumlahCustomer },
    { label: "Pendapatan Kotor", value: formatRupiah(kpi.gross), icon: ReceiptText, tone: "green", comparison: kpi.comparison.gross },
    { label: "COS", value: formatRupiah(kpi.cos), icon: Box, tone: "orange", comparison: kpi.comparison.cos },
    { label: "COM", value: formatRupiah(kpi.com), icon: Megaphone, tone: "purple", comparison: kpi.comparison.com },
    { label: "AOV", value: formatRupiah(kpi.aov), icon: ShoppingCart, tone: "blue", comparison: kpi.comparison.aov },
    { label: "Pendapatan Bersih", value: formatRupiah(kpi.pendapatanBersih), icon: WalletCards, tone: "green", comparison: kpi.comparison.pendapatanBersih },
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label} className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", TONE_BG[card.tone])}>
                <card.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground">{card.label}</p>
                <p className="truncate text-base font-bold tabular tracking-tight">{card.value}</p>
              </div>
            </div>
            <Comparison comparison={card.comparison} previousPeriod={kpi.previousPeriod} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const TONE_BG = {
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
  purple: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
};

function Comparison({ comparison, previousPeriod }: { comparison: KpiComparison; previousPeriod: OverviewKpi["previousPeriod"] }) {
  const value = comparison.percentage;
  return (
    <div className="mt-3 flex min-h-4 items-center gap-1.5 text-[9px]">
      {value == null ? (
        <span className="font-semibold text-muted-foreground">—</span>
      ) : value >= 0 ? (
        <span className="flex items-center font-semibold text-emerald-600"><ArrowUpRight className="h-3 w-3" />{Math.abs(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</span>
      ) : (
        <span className="flex items-center font-semibold text-red-500"><ArrowDownRight className="h-3 w-3" />{Math.abs(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</span>
      )}
      <span className="truncate text-muted-foreground">
        {previousPeriod ? `vs ${formatDate(previousPeriod.from)}–${formatDate(previousPeriod.to)}` : "tanpa periode pembanding"}
      </span>
    </div>
  );
}

function TrendCard({
  trends,
  granularity,
  onGranularityChange,
}: {
  trends: Record<TrendGranularity, TrendPoint[]>;
  granularity: TrendGranularity;
  onGranularityChange: (value: TrendGranularity) => void;
}) {
  return (
    <DashboardCard title="Tren Pendapatan & Pesanan" action={<GranularityTabs value={granularity} onChange={onGranularityChange} />}>
      <div className="h-[250px]" aria-label="Tren pendapatan dan jumlah pesanan">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={trends[granularity]} margin={{ top: 8, right: 8, bottom: 4, left: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 9 }} minTickGap={22} />
            <YAxis yAxisId="money" tickFormatter={(value) => formatRupiahShort(Number(value))} tick={{ fontSize: 9 }} width={60} />
            <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 9 }} width={28} allowDecimals={false} />
            <Tooltip formatter={(value, name) => name === "Pendapatan (Rp)" ? formatRupiah(String(value)) : Number(value).toLocaleString("id-ID")} labelFormatter={(label) => formatDate(String(label))} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line yAxisId="money" type="monotone" dataKey="revenue" name="Pendapatan (Rp)" stroke={COLORS.green} strokeWidth={2} dot={false} />
            <Line yAxisId="orders" type="monotone" dataKey="orderCount" name="Jumlah Pesanan" stroke={COLORS.blue} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function GranularityTabs({ value, onChange }: { value: TrendGranularity; onChange: (value: TrendGranularity) => void }) {
  const options: { value: TrendGranularity; label: string }[] = [
    { value: "daily", label: "Harian" },
    { value: "weekly", label: "Mingguan" },
    { value: "monthly", label: "Bulanan" },
  ];
  return (
    <div className="flex rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("rounded px-2 py-1 text-[9px]", value === option.value && "bg-card font-semibold shadow-sm")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FinancialSummary({ kpi }: { kpi: OverviewKpi }) {
  return (
    <DashboardCard title="Ringkasan Keuangan">
      <div className="space-y-3 pt-1 text-xs">
        <MoneyRow label="Pendapatan Kotor" value={kpi.gross} />
        <MoneyRow label="COS" value={kpi.cos} negative />
        <MoneyRow label="COM" value={kpi.com} negative />
        <MoneyRow label="Refund" value={kpi.refund} negative />
        <div className="border-t" />
        <MoneyRow label="Pendapatan Bersih" value={kpi.pendapatanBersih} total />
      </div>
    </DashboardCard>
  );
}

function MoneyRow({ label, value, negative, total }: { label: string; value: string; negative?: boolean; total?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", total && "pt-1 text-sm font-bold")}>
      <span>{label}</span>
      <span className={cn("tabular font-semibold", negative && BigInt(value) > 0n && "text-red-500", total && "text-emerald-600")}>
        {negative && BigInt(value) > 0n ? "- " : ""}{formatRupiah(value)}
      </span>
    </div>
  );
}

function TopProductCard({ rows }: { rows: ProductDimensionRow[] }) {
  return (
    <DashboardCard title="Top Produk" action={<span className="text-[9px] text-muted-foreground">Berdasarkan Pendapatan</span>}>
      <HorizontalMoneyBars rows={rows.map((row) => ({ label: row.productName, value: row.totalSales }))} color={COLORS.green} />
    </DashboardCard>
  );
}

function SalesSourceCard({ rows }: { rows: SalesSourceRow[] }) {
  return (
    <DashboardCard title="Penjualan Berdasarkan Sumber">
      <HorizontalMoneyBars rows={rows.map((row) => ({ label: row.source, value: row.value }))} color={COLORS.blue} />
    </DashboardCard>
  );
}

function HorizontalMoneyBars({ rows, color }: { rows: { label: string; value: string }[]; color: string }) {
  return (
    <div className="h-[205px]">
      {rows.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 72, bottom: 4, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tickFormatter={(value) => formatRupiahShort(Number(value))} tick={{ fontSize: 9 }} />
            <YAxis type="category" dataKey="label" width={88} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(value) => formatRupiah(String(value))} />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={12} label={{ position: "right", formatter: (value: unknown) => formatRupiah(String(value)), fontSize: 9 }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PaymentCard({ rows, gross }: { rows: PaymentComposition[]; gross: string }) {
  const colors = [COLORS.green, COLORS.blue];
  return (
    <DashboardCard title="Metode Pembayaran">
      <div className="grid min-h-[190px] grid-cols-[130px_1fr] items-center gap-2">
        <div className="h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="paymentMethod" innerRadius={38} outerRadius={58} paddingAngle={1}>
                {rows.map((row, index) => <Cell key={row.paymentMethod} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => formatRupiah(String(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 text-[10px]">
          {rows.map((row, index) => <LegendValue key={row.paymentMethod} label={row.paymentMethod} value={row.value} total={gross} color={colors[index % colors.length]!} />)}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{formatRupiah(gross)}</span></div>
        </div>
      </div>
    </DashboardCard>
  );
}

function StatusCard({ rows }: { rows: StatusCompositionRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <DashboardCard title="Status Pesanan">
      <div className="grid min-h-[190px] grid-cols-[140px_1fr] items-center gap-2">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="count" nameKey="status" innerRadius={40} outerRadius={62} paddingAngle={1}>
                {rows.map((row) => <Cell key={row.status} fill={STATUS_COLORS[row.status]} />)}
              </Pie>
              <Tooltip formatter={(value) => Number(value).toLocaleString("id-ID")} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[9px]">
          {rows.map((row) => (
            <div key={row.status} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 truncate"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[row.status] }} />{humanStatus(row.status)}</span>
              <span className="font-semibold tabular">{row.count.toLocaleString("id-ID")}</span>
            </div>
          ))}
          <div className="col-span-2 mt-1 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{total.toLocaleString("id-ID")}</span></div>
        </div>
      </div>
    </DashboardCard>
  );
}

function ComCard({ rows, com }: { rows: ComCompositionRow[]; com: string }) {
  return (
    <DashboardCard title="Komposisi COM">
      <div className="h-[190px]">
        {rows.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((row) => ({ ...row, label: COM_LABEL[row.category] ?? row.category }))} layout="vertical" margin={{ top: 0, right: 62, bottom: 0, left: 26 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(value) => formatRupiahShort(Number(value))} tick={{ fontSize: 8 }} />
              <YAxis type="category" dataKey="label" width={82} tick={{ fontSize: 8 }} />
              <Tooltip formatter={(value) => formatRupiah(String(value))} />
              <Bar dataKey="value" fill={COLORS.purple} radius={[0, 4, 4, 0]} maxBarSize={10} label={{ position: "right", formatter: (value: unknown) => `${percent(String(value), com)}%`, fontSize: 8 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardCard>
  );
}

function LatestOrdersCard({ rows, onOpen }: { rows: LatestOrderRow[]; onOpen: (id: number) => void }) {
  return (
    <DashboardCard title="Pesanan Terbaru" action={<Button asChild variant="outline" size="sm" className="h-7 text-[10px]"><Link href="/workspace/pesanan">Lihat semua</Link></Button>} noContentPadding>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[10px]">
          <thead className="border-y bg-muted/30 text-muted-foreground">
            <tr>{["Tanggal", "Order ID", "Nama Customer", "CRM", "Produk", "Total", "Pembayaran", "Status"].map((label) => <th key={label} className="px-4 py-2 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} tabIndex={0} onClick={() => onOpen(row.id)} onKeyDown={(event) => event.key === "Enter" && onOpen(row.id)} className="cursor-pointer border-b last:border-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <td className="whitespace-nowrap px-4 py-2">{formatDate(row.orderDate)}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono">{row.orderId}</td>
                <td className="px-4 py-2 font-medium">{row.customerName}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="font-normal">{row.crmName}</Badge></td>
                <td className="max-w-[250px] truncate px-4 py-2">{row.products}</td>
                <td className="whitespace-nowrap px-4 py-2 tabular">{formatRupiah(row.total)}</td>
                <td className="px-4 py-2">{row.paymentMethod}</td>
                <td className="px-4 py-2"><Badge variant={STATUS_VARIANT[row.status]}>{humanStatus(row.status)}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Belum ada pesanan pada periode ini.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}

function DashboardCard({ title, action, children, noContentPadding }: { title: string; action?: React.ReactNode; children: React.ReactNode; noContentPadding?: boolean }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 py-3">
        <CardTitle className="text-xs">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={noContentPadding ? "p-0" : "px-4 pb-3 pt-0"}>{children}</CardContent>
    </Card>
  );
}

function LegendValue({ label, value, total, color }: { label: string; value: string; total: string; color: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>
      <span className="font-semibold">{percent(value, total)}%</span>
      <span className="tabular text-muted-foreground">{formatRupiah(value)}</span>
    </div>
  );
}

function percent(value: string, total: string): string {
  if (BigInt(total) === 0n) return "0";
  return ((Number(value) / Number(total)) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

function humanStatus(status: WorkspaceOrderStatus): string {
  return status.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function Empty() {
  return <div className="grid h-full place-items-center text-xs text-muted-foreground">Belum ada data.</div>;
}
