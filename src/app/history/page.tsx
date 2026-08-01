import Link from "next/link";
import { loadImportHistory } from "@/app/import-admin-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/customer/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string };

export default async function ImportHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const result = await loadImportHistory(page);

  return (
    <AppShell title="Import History">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{result.total.toLocaleString("id-ID")} import batch</CardTitle>
            <CardDescription>Jejak upload semua sumber · batch aktif ditandai hijau</CardDescription>
          </div>
          <Link href="/import" className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            Upload baru
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.rows.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[900px] w-full text-xs">
                <thead><tr className="bg-muted/70 text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">ID</th><th className="px-3 py-2">File</th><th className="px-3 py-2">Sumber</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Upload</th><th className="px-3 py-2">As of</th><th className="px-3 py-2 text-right">Rows</th><th className="px-3 py-2 text-right">Valid</th><th className="px-3 py-2 text-right">Excluded</th><th className="px-3 py-2 text-right">Review</th></tr></thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-2 tabular">#{row.id}</td>
                      <td className="max-w-64 truncate px-3 py-2 font-medium" title={row.filename}>{row.filename}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{sourceLabel(row.sourceType)}</Badge></td>
                      <td className="px-3 py-2"><StatusBadge status={row.status} active={row.isActive} /></td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(row.uploadedAt)}</td>
                      <td className="px-3 py-2">{formatDate(row.asOfDate)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatInteger(row.totalRows)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatInteger(row.validRows)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatInteger(row.excludedRows)}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {row.needsReviewRows > 0 ? <Link className="text-amber-700 underline dark:text-amber-400" href={`/quality?batchId=${row.id}&issueType=UNKNOWN_PRODUCT`}>{formatInteger(row.needsReviewRows)}</Link> : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada import.</p>}
          <Pagination page={result.page} perPage={result.perPage} total={result.total} hrefForPage={(target) => `/history?page=${target}`} />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  if (active) return <Badge variant="success">Active</Badge>;
  if (status === "COMPLETED") return <Badge variant="outline">Completed</Badge>;
  if (status === "FAILED") return <Badge variant="warning">Failed</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
function sourceLabel(value: string) { return value === "DATABASE_ALL" ? "Database All" : value === "GROUP_LIST" ? "Group List" : "DataKSB"; }
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—"; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
