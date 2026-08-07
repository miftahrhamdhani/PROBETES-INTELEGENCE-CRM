import { NextResponse } from "next/server";
import { authErrorStatus, requireCrmPermission } from "@/server/auth/guards";
import { workspaceProductFilterSchema } from "@/lib/workspace-master-data-contracts";
import { listWorkspaceProducts } from "@/server/workspace/products";
import { toWorkspaceProductCsv, toWorkspaceProductExportRows } from "@/server/workspace/products-export";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";
const EXPORT_LIMIT = 10_000;

export const GET = withTiming("/api/workspace/master-produk/export.csv", async (request) => {
  try {
    await requireCrmPermission("crm.product.export");
    const filter = { ...workspaceProductFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams)), page: 1, perPage: EXPORT_LIMIT };
    const { rows } = await listWorkspaceProducts(filter);
    return new NextResponse(toWorkspaceProductCsv(toWorkspaceProductExportRows(rows)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="master-produk-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request tidak valid" }, { status: authErrorStatus(error) ?? 400 });
  }
});
