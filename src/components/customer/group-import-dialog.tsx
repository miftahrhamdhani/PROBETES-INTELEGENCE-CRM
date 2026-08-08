"use client";

import * as React from "react";
import Papa from "papaparse";
import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { commitGroupImportAction, previewGroupImportAction } from "@/app/group-membership-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GROUP_IMPORT_STATUS_LABELS,
  type GroupImportPreview,
  type GroupImportResult,
  type GroupImportStatus,
} from "@/lib/group-import-contracts";
import { cn } from "@/lib/utils";

type ClientRow = { rowNumber: number; values: Record<string, unknown> };

const STATUS_TONE: Record<GroupImportStatus, string> = {
  NEW_MEMBER: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  ALREADY_GROUPED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  UNMATCHED: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  INVALID_PHONE: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  DUPLICATE_IN_FILE: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
};

/**
 * Import Data Grup — upload → parse → preview → konfirmasi → commit.
 *
 * TIDAK PERNAH langsung menulis dari upload: preview wajib dilihat dulu, dan
 * commit menghitung ulang klasifikasinya di server (hasil preview di layar
 * tidak dipakai sebagai dasar penulisan).
 */
export function GroupImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = React.useState<ClientRow[] | null>(null);
  const [filename, setFilename] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = React.useState("");
  const [preview, setPreview] = React.useState<GroupImportPreview | null>(null);
  const [result, setResult] = React.useState<GroupImportResult | null>(null);
  const [busy, setBusy] = React.useState<null | "parse" | "preview" | "commit">(null);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setRows(null);
    setFilename("");
    setHeaders([]);
    setPhoneColumn("");
    setPreview(null);
    setResult(null);
    setBusy(null);
    setError(null);
  }

  async function handleFile(file: File) {
    setBusy("parse");
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(buffer)
        : await parseXlsx(buffer);
      if (!parsed.rows.length) throw new Error("File tidak berisi baris data.");
      setRows(parsed.rows);
      setHeaders(parsed.headers);
      setFilename(file.name);
      await runPreview(file.name, parsed.rows, "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "File tidak dapat dibaca.");
      setBusy(null);
    }
  }

  async function runPreview(name: string, data: ClientRow[], phoneCol: string) {
    setBusy("preview");
    setError(null);
    try {
      const hasil = await previewGroupImportAction({
        filename: name,
        rows: data,
        mapping: phoneCol ? { phone: phoneCol } : undefined,
      });
      setPreview(hasil);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Gagal membaca isi file.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    setBusy("commit");
    setError(null);
    try {
      const hasil = await commitGroupImportAction({
        filename,
        rows,
        mapping: phoneColumn ? { phone: phoneColumn } : undefined,
      });
      setResult(hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import gagal.");
    } finally {
      setBusy(null);
    }
  }

  const s = preview?.summary;
  const bisaCommit = !!s && s.newMember + s.updated > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Data Grup</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 text-xs">
          {result ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Import Data Grup Berhasil
              </p>
              <SummaryGrid summary={result} />
              <p className="text-muted-foreground">
                Member lama yang tidak ada di file ini <strong>tidak diubah</strong> — import bersifat menambah/memperbarui saja.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-accent/40">
                  <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{filename || "Pilih file CSV atau Excel"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Wajib ada kolom No HP. Kolom Nama, Nama Grup, PIC, Tanggal Masuk Grup, dan Catatan bersifat opsional.
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                  />
                </label>
              </div>

              {busy ? (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {busy === "parse" ? "Membaca file..." : busy === "preview" ? "Mencocokkan customer..." : "Menyimpan..."}
                </p>
              ) : null}

              {error ? (
                <div className="space-y-2 rounded-md border border-rose-300/60 bg-rose-50 p-3 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                  <p className="flex items-center gap-1.5 font-medium">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> {error}
                  </p>
                  {/* Kolom telepon tidak terdeteksi -> user memilih sendiri,
                      bukan ditebak diam-diam oleh sistem. */}
                  {headers.length > 0 && rows ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Pilih kolom No HP:</span>
                      <select
                        className="h-8 rounded-md border bg-card px-2"
                        value={phoneColumn}
                        onChange={(e) => {
                          setPhoneColumn(e.target.value);
                          if (e.target.value) void runPreview(filename, rows, e.target.value);
                        }}
                      >
                        <option value="">— pilih kolom —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {s ? (
                <>
                  <SummaryGrid summary={s} />
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[46rem] text-left text-[11px]">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-1.5 font-semibold">No</th>
                          <th className="px-2 py-1.5 font-semibold">No HP</th>
                          <th className="px-2 py-1.5 font-semibold">Nama File</th>
                          <th className="px-2 py-1.5 font-semibold">Customer Match</th>
                          <th className="px-2 py-1.5 font-semibold">Nama Grup</th>
                          <th className="px-2 py-1.5 font-semibold">Status Import</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview!.rows.map((row) => (
                          <tr key={row.rowNumber} className="border-t">
                            <td className="px-2 py-1.5 tabular text-muted-foreground">{row.rowNumber}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                              {row.normalizedPhone ?? (row.rawPhone || "—")}
                            </td>
                            <td className="px-2 py-1.5">{row.fileName ?? "—"}</td>
                            <td className="px-2 py-1.5">{row.customerName ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-2 py-1.5">
                              {row.changes.length
                                ? row.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(", ")
                                : row.groupName ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge variant="outline" className={cn("whitespace-nowrap font-medium", STATUS_TONE[row.status])}>
                                {GROUP_IMPORT_STATUS_LABELS[row.status]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview!.truncated ? (
                    <p className="text-[11px] text-muted-foreground">
                      Menampilkan {preview!.rows.length} baris pertama. Seluruh {s.totalRows.toLocaleString("id-ID")} baris tetap diproses saat import.
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => { reset(); onOpenChange(false); }}>Lihat Member Grup</Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }} disabled={busy === "commit"}>
                Batal
              </Button>
              <Button type="button" size="sm" onClick={handleCommit} disabled={!bisaCommit || busy !== null}>
                {busy === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Import &amp; Tandai Sudah Masuk Grup
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryGrid({ summary }: { summary: GroupImportPreview["summary"] }) {
  const items: [string, number][] = [
    ["Total Baris", summary.totalRows],
    ["No HP Valid", summary.validPhone],
    ["Customer Ketemu", summary.matched],
    ["Member Baru", summary.newMember],
    ["Sudah Grouped", summary.alreadyGrouped],
    ["Update", summary.updated],
    ["Tidak Ditemukan", summary.unmatched],
    ["No HP Invalid", summary.invalidPhone],
    ["Duplikat di File", summary.duplicateInFile],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border p-2">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-base font-semibold tabular">{value.toLocaleString("id-ID")}</p>
        </div>
      ))}
    </div>
  );
}

function parseCsv(buffer: ArrayBuffer): { headers: string[]; rows: ClientRow[] } {
  const text = new TextDecoder("utf-8").decode(buffer);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) throw new Error(`CSV tidak valid: ${parsed.errors[0]!.message}`);
  return {
    headers: parsed.meta.fields ?? [],
    rows: parsed.data.map((record, index) => ({ rowNumber: index + 2, values: { ...record } })),
  };
}

/** `xlsx` di-import DINAMIS — library terberat di aplikasi, hanya dibutuhkan
 *  setelah user benar-benar memilih file .xlsx (pola sama dengan Import Database All). */
async function parseXlsx(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: ClientRow[] }> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("File Excel tidak punya sheet.");
  const sheet = workbook.Sheets[sheetName]!;
  // raw:true WAJIB: tanpa ini nomor HP 12-13 digit terbaca sebagai notasi
  // ilmiah ("6.28E+12") dan nomornya rusak permanen.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: false });
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  if (!headers.length) throw new Error("Header sheet kosong.");
  const rows = matrix.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(
      headers.map((header, column) => {
        const cell = cells[column];
        return [header, cell instanceof Date ? cell.toISOString().slice(0, 10) : (cell as unknown)];
      })
    ),
  }));
  return { headers, rows };
}
