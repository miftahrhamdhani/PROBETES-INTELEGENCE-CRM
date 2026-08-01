"use client";

import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportCommitResult, ImportPreview } from "@/lib/import-contracts";

interface ClientRow { rowNumber: number; values: Record<string, unknown> }
type Step = "idle" | "parsing" | "uploading" | "preview" | "committing" | "done" | "error";

const CHUNK_ROWS = 750;

export function DatabaseAllImport() {
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setPreview(null);
    setResult(null);
    setStep("parsing");
    setProgress(5);

    try {
      const isCsv = /\.csv$/i.test(file.name);
      const isXlsx = /\.xlsx$/i.test(file.name);
      if (!isCsv && !isXlsx) throw new Error("Gunakan file .xlsx atau .csv Database All");

      const buffer = await file.arrayBuffer();
      const fileHash = await sha256(buffer);
      const { headers, rows } = isCsv ? parseCsvFile(buffer) : parseXlsxFile(buffer);
      if (!headers.length) throw new Error("Header file kosong");
      if (!rows.length) throw new Error("Tidak ada baris data ditemukan");
      setProgress(15);

      const init = await post<{ batchId: number; duplicate: boolean; completed: boolean }>("/api/import/init", {
        filename: file.name,
        fileHash,
        totalRows: rows.length,
        headers,
      });

      if (init.completed) {
        const completed = await post<ImportPreview>("/api/import/validate", { batchId: init.batchId });
        setPreview(completed);
        setStep("preview");
        setProgress(100);
        return;
      }

      setStep("uploading");
      for (let offset = 0; offset < rows.length; offset += CHUNK_ROWS) {
        await post("/api/import/chunk", { batchId: init.batchId, rows: rows.slice(offset, offset + CHUNK_ROWS) });
        setProgress(15 + Math.round((Math.min(offset + CHUNK_ROWS, rows.length) / rows.length) * 70));
      }
      const nextPreview = await post<ImportPreview>("/api/import/validate", { batchId: init.batchId });
      setPreview({ ...nextPreview, duplicate: init.duplicate });
      setProgress(100);
      setStep("preview");
    } catch (cause) {
      fail(cause);
    }
  }

  async function commit() {
    if (!preview) return;
    if (!window.confirm("Aktifkan Database All ini? Dashboard akan beralih setelah seluruh commit sukses.")) return;
    setStep("committing");
    setError(null);
    try {
      const committed = await post<ImportCommitResult>("/api/import/commit", { batchId: preview.batchId });
      setResult(committed);
      setStep("done");
    } catch (cause) {
      fail(cause);
    }
  }

  function fail(cause: unknown) {
    setError(cause instanceof Error ? cause.message : "Import gagal");
    setStep("error");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Upload Database All</CardTitle><CardDescription>File diproses di browser, lalu dikirim bertahap ke Neon. .xlsx: sheet wajib "allbaru". .csv: baris 1 header, data mulai baris 2.</CardDescription></CardHeader>
        <CardContent>
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center hover:bg-muted/60">
            <FileSpreadsheet className="mb-3 h-8 w-8 text-primary" />
            <span className="text-sm font-medium">Pilih file Database All (.xlsx atau .csv)</span>
            <span className="mt-1 text-xs text-muted-foreground">Nomor HP dibaca sebagai teks; file mentah tidak diubah.</span>
            <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={selectFile} disabled={busy(step)} />
          </label>
          {busy(step) && <Progress value={progress} label={step === "committing" ? "Menyimpan canonical, RFM, dan cluster…" : "Memproses dan mengunggah…"} />}
          {error && <div className="mt-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        </CardContent>
      </Card>

      {preview && (step === "preview" || step === "committing") && (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Preview import</CardTitle><CardDescription>{preview.filename} · Data as of {preview.asOfDate ?? "—"}</CardDescription></div>{preview.duplicate && <Badge variant="outline">File pernah diunggah</Badge>}</CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Rows" value={preview.totalRows} />
              <Metric label="Valid" value={preview.validRows} />
              <Metric label="Excluded" value={preview.excludedRows} />
              <Metric label="Needs review" value={preview.needsReviewRows} />
              <Metric label="Customers" value={preview.customerCount} />
              <Metric label="Orders" value={preview.orderCount} />
            </div>
            <div className="flex flex-wrap gap-2">{Object.entries(preview.issueCounts).map(([code, count]) => <Badge key={code} variant="outline">{code}: {count}</Badge>)}</div>
            <Button onClick={commit} disabled={step === "committing" || preview.status === "COMPLETED"}><Upload className="h-4 w-4" />{preview.status === "COMPLETED" ? "Dataset sudah aktif" : "Commit & aktifkan dataset"}</Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-green-600/40"><CardContent className="flex gap-3 p-5"><CheckCircle2 className="h-5 w-5 text-green-600" /><div><p className="text-sm font-semibold">Import selesai dan dataset aktif</p><p className="mt-1 text-xs text-muted-foreground">{result.customers.toLocaleString("id-ID")} customer · {result.orders.toLocaleString("id-ID")} order · {result.items.toLocaleString("id-ID")} item · as of {result.asOfDate}</p></div></CardContent></Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border bg-muted/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular">{value.toLocaleString("id-ID")}</p></div>; }
function Progress({ value, label }: { value: number; label: string }) { return <div className="mt-4"><div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{label}</span><span>{value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${value}%` }} /></div></div>; }
function busy(step: Step) { return step === "parsing" || step === "uploading" || step === "committing"; }
function serializeCell(value: unknown) { if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; return value; }
async function sha256(buffer: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function parseXlsxFile(buffer: ArrayBuffer): { headers: string[]; rows: ClientRow[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets.allbaru;
  if (!sheet) throw new Error("Sheet 'allbaru' tidak ditemukan");
  // raw:true — phone column is Excel-typed as number; raw:false would return the
  // General-format display string, which for 12-13 digit numbers is scientific
  // notation ("6.28222E+12") and unrecoverable. raw:true keeps the exact integer.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: false });
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  if (!headers.length) throw new Error("Header sheet allbaru kosong");
  // Row 2 workbook produksi hanya berisi formula pembantu; data mulai row 3.
  const rows = matrix.slice(2).map((cells, index) => ({
    rowNumber: index + 3,
    values: Object.fromEntries(headers.map((header, column) => [header, serializeCell(cells[column])])),
  }));
  return { headers, rows };
}

/**
 * CSV: konvensi standar, bukan template Excel — baris 1 header, data mulai
 * baris 2 (tidak ada baris bantu/formula seperti file .xlsx). Nilai selalu
 * string (dynamicTyping off) — aman, normalizePhone/normalizeAmount/
 * normalizeDate di backend sudah menerima string mentah.
 */
function parseCsvFile(buffer: ArrayBuffer): { headers: string[]; rows: ClientRow[] } {
  const text = new TextDecoder("utf-8").decode(buffer);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    const first = parsed.errors[0]!;
    const rowNumber = first.row != null ? first.row + 2 : null;
    throw new Error(`CSV tidak valid${rowNumber ? ` (baris ${rowNumber})` : ""}: ${first.message}`);
  }
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.map((record, index) => ({
    rowNumber: index + 2,
    values: { ...record } as Record<string, unknown>,
  }));
  return { headers, rows };
}
async function post<T = unknown>(url: string, body: unknown): Promise<T> { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? `Request gagal (${response.status})`); return data as T; }
