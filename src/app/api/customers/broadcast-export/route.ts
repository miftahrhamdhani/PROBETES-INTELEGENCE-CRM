import { NextResponse } from "next/server";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import {
  broadcastRowsToCsv,
  broadcastRowsToXlsx,
  buildBroadcastRows,
} from "@/server/analytics/broadcast-export";
import { customerListFilterSchema } from "@/lib/list-filter-contracts";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * FR-24 — export daftar broadcast per cluster (ADMIN & CRM).
 *
 * Filter dibaca dari query string yang SAMA dengan URL halaman Customers/Cluster,
 * lalu divalidasi Zod dan diteruskan ke buildConditions yang sama — sehingga
 * "yang diexport" = "yang terlihat di layar".
 */
export async function GET(request: Request) {
  try {
    await requireRole("ADMIN", "CRM");

    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const raw = Object.fromEntries(
      [...url.searchParams.entries()].filter(([key, value]) => key !== "format" && value !== "")
    );
    const filter = customerListFilterSchema.parse(raw);

    const rows = await buildBroadcastRows(filter);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = filter.cluster ? `-${filter.cluster.toLowerCase()}` : "";
    const filename = `broadcast${scope}-${stamp}.${format}`;

    if (format === "xlsx") {
      const buffer = broadcastRowsToXlsx(rows);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${filename}"`,
          "x-total-rows": String(rows.length),
        },
      });
    }

    return new NextResponse(broadcastRowsToCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-total-rows": String(rows.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request tidak valid" },
      { status: authErrorStatus(error) ?? 400 }
    );
  }
}
