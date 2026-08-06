"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah, formatRupiahShort } from "@/lib/format";
import type { CustomerSummary, PaymentComposition, ProductDimensionRow, TrendPoint } from "@/server/workspace/pesanan-overview";

const colors = { totalSales: "#2a78d6", cos: "#eb6834", com: "#1baf7a", pendapatanBersih: "#8f5fe8", cod: "#eda100", transfer: "#2a78d6" };
const formatMoney = (value: string | number) => formatRupiahShort(BigInt(Math.trunc(Number(value))));

export function PesananOverviewCharts({
  trend,
  productsByQuantity,
  productsByRevenue,
  productsByCos,
  paymentComposition,
  customerSummary,
}: {
  trend: TrendPoint[];
  productsByQuantity: ProductDimensionRow[];
  productsByRevenue: ProductDimensionRow[];
  productsByCos: ProductDimensionRow[];
  paymentComposition: PaymentComposition[];
  customerSummary: CustomerSummary;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Tren Total Sales, COS, COM, Pendapatan Bersih</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[320px]" aria-label="Grafik tren Total Sales, COS, COM, Pendapatan Bersih">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 22, left: 4 }}>
                <CartesianGrid stroke="currentColor" className="text-border" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatMoney} tick={{ fontSize: 11 }} width={74} />
                <Tooltip formatter={(value) => formatMoney(String(value))} />
                <Legend />
                <Line type="monotone" dataKey="totalSales" name="Total Sales" stroke={colors.totalSales} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="cos" name="COS" stroke={colors.cos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="com" name="COM" stroke={colors.com} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="pendapatanBersih" name="Pendapatan Bersih" stroke={colors.pendapatanBersih} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProductBarCard title="Produk Terlaris (QTY Terjual)" rows={productsByQuantity} dataKey="quantity" color={colors.totalSales} formatValue={(v) => Number(v).toLocaleString("id-ID")} />
        <ProductBarCard title="Produk Penjualan Terbesar" rows={productsByRevenue} dataKey="totalSales" color={colors.cos} formatValue={formatMoney} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Produk dengan COS Terbesar</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]" aria-label="Grafik produk dengan COS terbesar">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productsByCos.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 12, bottom: 12, left: 90 }}>
                  <CartesianGrid stroke="currentColor" className="text-border" horizontal={false} />
                  <XAxis type="number" tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="productName" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip content={<CosTooltip />} />
                  <Bar dataKey="totalCos" name="Total COS" fill={colors.com} maxBarSize={20} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Komposisi Pembayaran</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]" aria-label="Grafik komposisi pembayaran COD vs Transfer">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentComposition} dataKey="closing" nameKey="paymentMethod" cx="50%" cy="50%" outerRadius={90} label={(entry) => `${entry.paymentMethod}: ${entry.closing}`}>
                    {paymentComposition.map((entry) => (
                      <Cell key={entry.paymentMethod} fill={entry.paymentMethod === "COD" ? colors.cod : colors.transfer} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, _name, item) => [`${value} pesanan (${formatRupiah((item.payload as PaymentComposition).value)})`, (item.payload as PaymentComposition).paymentMethod]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Ringkasan Customer</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Jumlah Customer" value={customerSummary.jumlahCustomer} />
          <Stat label="Customer Baru" value={customerSummary.customerBaru} />
          <Stat label="Repeat Customer" value={customerSummary.repeatCustomer} />
          <Stat label="Jumlah Pesanan" value={customerSummary.jumlahPesanan} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProductBarCard({
  title,
  rows,
  dataKey,
  color,
  formatValue,
}: {
  title: string;
  rows: ProductDimensionRow[];
  dataKey: "quantity" | "totalSales";
  color: string;
  formatValue: (value: string | number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[280px]" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 12, bottom: 12, left: 90 }}>
              <CartesianGrid stroke="currentColor" className="text-border" horizontal={false} />
              <XAxis type="number" tickFormatter={formatValue} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="productName" width={90} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => formatValue(String(value))} />
              <Bar dataKey={dataKey} fill={color} maxBarSize={20} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CosTooltip({ active, payload }: { active?: boolean; payload?: { payload: ProductDimensionRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{row.productName}</p>
      <p>HPP SALE: {formatMoney(row.cosSale)}</p>
      <p>HPP Bonus/Sample: {formatMoney(row.cosBonus)}</p>
      <p className="font-medium">Total COS: {formatMoney(row.totalCos)}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value.toLocaleString("id-ID")}</p>
    </div>
  );
}
