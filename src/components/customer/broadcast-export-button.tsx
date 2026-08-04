"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * FR-24 — unduh daftar broadcast sesuai filter yang SEDANG aktif.
 *
 * `filter` yang dioper adalah objek filter yang juga dipakai memuat tabel,
 * sehingga isi berkas persis sama dengan yang terlihat. Jumlah baris hasil
 * dibaca dari header `x-total-rows` lalu ditampilkan sebagai konfirmasi.
 */
export function BroadcastExportButton({
  filter,
  expectedRows,
  label = "Export broadcast",
}: {
  filter: Record<string, unknown>;
  expectedRows?: number;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  async function download(format: "csv" | "xlsx") {
    setBusy(true);
    setNote(null);
    try {
      const params = new URLSearchParams({ format });
      for (const [key, value] of Object.entries(filter)) {
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
      }
      const response = await fetch(`/api/customers/broadcast-export?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Export gagal (${response.status})`);
      }
      const total = Number(response.headers.get("x-total-rows") ?? "0");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `broadcast.${format}`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      setNote(
        expectedRows !== undefined && expectedRows !== total
          ? `Terunduh ${total.toLocaleString("id-ID")} baris (daftar menampilkan ${expectedRows.toLocaleString("id-ID")}; selisih = customer tanpa No. HP valid).`
          : `Terunduh ${total.toLocaleString("id-ID")} baris.`
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Export gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => download("csv")}>Unduh CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => download("xlsx")}>Unduh Excel (.xlsx)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {note ? <p className="max-w-xs text-right text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}
