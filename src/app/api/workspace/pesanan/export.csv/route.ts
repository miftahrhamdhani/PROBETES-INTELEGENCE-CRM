import { NextResponse } from "next/server";
import { authErrorStatus, requireCrmPermission } from "@/server/auth/guards";
import { WORKSPACE_EXPORT_MAX_ROWS } from "@/lib/list-chunk";
import { workspaceOrderFilterSchema } from "@/lib/workspace-pesanan-contracts";
import { listWorkspaceOrders } from "@/server/workspace/pesanan";
import { toWorkspacePesananCsv, toWorkspacePesananExportRows } from "@/server/workspace/pesanan-export";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";

export const GET = withTiming("/api/workspace/pesanan/export.csv", async (request) => {
  try {
    await requireCrmPermission("crm.order.export");
    const params = new URL(request.url).searchParams;
    // perPage/page ditimpa SETELAH parse: batas max di skema itu untuk input
    // URL user, dan melewatkan angka export ke .parse() membuat seluruh
    // endpoint export gagal validasi. Export selalu seluruh hasil filter,
    // jadi `page` juga direset supaya tidak ikut offset halaman aktif.
    const filter = {
      ...workspaceOrderFilterSchema.parse(Object.fromEntries(params)),
      page: 1,
      perPage: WORKSPACE_EXPORT_MAX_ROWS,
    };
    const { rows } = await listWorkspaceOrders(filter);
    const csv = toWorkspacePesananCsv(toWorkspacePesananExportRows(rows));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pesanan-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request tidak valid" }, { status: authErrorStatus(error) ?? 400 });
  }
});
