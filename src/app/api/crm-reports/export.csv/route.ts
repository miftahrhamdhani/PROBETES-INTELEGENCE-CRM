import { NextResponse } from "next/server";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { buildExportRows } from "@/server/crm-report/service";
import { toCsv } from "@/server/crm-report/export";
import { filterFromSearchParams } from "../filter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole("ADMIN", "CRM");
    const filter = filterFromSearchParams(new URL(request.url).searchParams);
    const rows = await buildExportRows(filter);
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: authErrorStatus(error) ?? 400 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Request tidak valid";
}
