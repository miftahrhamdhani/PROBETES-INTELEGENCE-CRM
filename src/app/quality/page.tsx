import Link from "next/link";
import { loadDataQualityIssues } from "@/app/import-admin-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/customer/pagination";
import { IssueDetail } from "@/components/quality/issue-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPORT_ISSUE_CODES, isImportExclusionCode, type ImportIssueCode } from "@/lib/import-contracts";

export const dynamic = "force-dynamic";

type SearchParams = { batchId?: string; issueType?: string; page?: string };

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const issueType = IMPORT_ISSUE_CODES.includes(params.issueType as ImportIssueCode)
    ? (params.issueType as ImportIssueCode)
    : undefined;
  const batchId = Number(params.batchId ?? "") || undefined;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const result = await loadDataQualityIssues({ batchId, issueType, page });

  function href(overrides: Partial<SearchParams>, remove: Array<keyof SearchParams> = []) {
    const query = new URLSearchParams();
    if (result.batchId) query.set("batchId", String(result.batchId));
    if (issueType) query.set("issueType", issueType);
    if (page > 1) query.set("page", String(page));
    for (const key of remove) query.delete(key);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    return `/quality?${query.toString()}`;
  }

  const exclusionCodes = IMPORT_ISSUE_CODES.filter(isImportExclusionCode);
  const operationalCodes = IMPORT_ISSUE_CODES.filter((code) => !isImportExclusionCode(code));
  const totalExcludedRows = exclusionCodes.reduce((sum, code) => sum + (result.counts[code] ?? 0), 0);

  return (
    <AppShell title="Data Quality">
      <div className="space-y-4">
        <section>
          <div className="mb-2">
            <h2 className="text-sm font-semibold">Import Exclusions</h2>
            <p className="text-xs text-muted-foreground">
              Baris tanpa nama/No HP valid, atau tanggal tidak valid — <strong>tidak pernah</strong> menjadi
              customer/order canonical, tidak masuk Customers/RFM/Cohort/Cluster. Raw row tetap tersimpan di
              sini untuk audit, bukan sesuatu yang perlu &ldquo;diperbaiki&rdquo; CRM.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {exclusionCodes.map((code) => {
              const count = result.counts[code] ?? 0;
              if (!count) return null;
              return (
                <Link key={code} href={href({ issueType: code, page: "" })}>
                  <Card className={issueType === code ? "border-dashed ring-2 ring-ring" : "border-dashed transition-colors hover:bg-accent/50"}>
                    <CardContent className="p-4">
                      <Badge variant="outline">{issueLabel(code)}</Badge>
                      <p className="mt-2 text-2xl font-semibold tabular text-muted-foreground">{count.toLocaleString("id-ID")}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">baris dikecualikan dari populasi CRM</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          {totalExcludedRows === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Tidak ada baris yang dikecualikan pada batch ini.</p>
          ) : null}
        </section>

        <section>
          <div className="mb-2">
            <h2 className="text-sm font-semibold">Data Quality — Operasional</h2>
            <p className="text-xs text-muted-foreground">
              Customer di sini <strong>sudah valid</strong> sebagai canonical CRM customer (nama + No HP +
              transaksi valid) — hanya punya isu sekunder yang perlu ditinjau CRM (produk belum dikenal,
              konflik data, dsb).
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {operationalCodes.map((code) => {
              const count = result.counts[code] ?? 0;
              if (!count) return null;
              return (
                <Link key={code} href={href({ issueType: code, page: "" })}>
                  <Card className={issueType === code ? "ring-2 ring-ring" : "transition-colors hover:bg-accent/50"}>
                    <CardContent className="p-4">
                      <Badge variant={code === "UNKNOWN_PRODUCT" || code === "NEEDS_REVIEW" ? "warning" : "outline"}>{issueLabel(code)}</Badge>
                      <p className="mt-2 text-2xl font-semibold tabular">{count.toLocaleString("id-ID")}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{result.total.toLocaleString("id-ID")} issue{issueType ? ` · ${issueLabel(issueType)}` : ""}</CardTitle>
              <CardDescription>
                Batch #{result.batchId ?? "—"} · raw row read-only
                {issueType && isImportExclusionCode(issueType) ? " · baris ini TIDAK menjadi customer CRM" : ""}
              </CardDescription>
            </div>
            {issueType ? <Link href={href({}, ["issueType", "page"])} className="text-xs text-primary hover:underline">Tampilkan semua</Link> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {result.rows.length ? (
              <div className="space-y-2">
                {result.rows.map((issue) => (
                  <div key={issue.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={isImportExclusionCode(issue.issueType) ? "outline" : issue.issueType === "UNKNOWN_PRODUCT" ? "warning" : "outline"}>
                          {issueLabel(issue.issueType)}
                        </Badge>
                        <span className="text-xs font-medium">Row {issue.rowNumber ?? "—"}</span>
                        <span className="max-w-60 truncate text-[11px] text-muted-foreground" title={issue.filename}>{issue.filename}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">#{issue.id}</span>
                    </div>
                    <div className="mt-2"><IssueDetail issue={issue} /></div>
                  </div>
                ))}
              </div>
            ) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Tidak ada issue untuk filter ini.</p>}
            <Pagination page={result.page} perPage={result.perPage} total={result.total} hrefForPage={(target) => href({ page: String(target) })} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function issueLabel(code: ImportIssueCode) {
  return (
    {
      MISSING_PHONE: "Missing phone",
      INVALID_PHONE: "Invalid phone",
      MISSING_NAME: "Missing name",
      MISSING_ORDER_ID: "Missing order ID",
      DUPLICATE_ORDER: "Duplicate order",
      UNKNOWN_PRODUCT: "Unknown product",
      AMOUNT_CONFLICT: "Amount conflict",
      INVALID_DATE: "Invalid date",
      NEEDS_REVIEW: "Needs review",
    } as Record<ImportIssueCode, string>
  )[code];
}
