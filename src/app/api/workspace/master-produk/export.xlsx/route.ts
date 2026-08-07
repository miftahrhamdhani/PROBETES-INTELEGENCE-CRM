import { NextResponse } from "next/server";
import { authErrorStatus, requireCrmPermission } from "@/server/auth/guards";
import { workspaceProductFilterSchema } from "@/lib/workspace-master-data-contracts";
import { listWorkspaceProducts } from "@/server/workspace/products";
import { toWorkspaceProductExportRows, toWorkspaceProductXlsxBuffer } from "@/server/workspace/products-export";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";
const EXPORT_LIMIT = 10_000;

export const GET = withTiming("/api/workspace/master-produk/export.xlsx", async (request) => {
  try {
    await requireCrmPermission("crm.product.export");
    const filter = { ...workspaceProductFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams)), page: 1, perPage: EXPORT_LIMIT };
    const { rows } = await listWorkspaceProducts(filter);
    return new NextResponse(new Uint8Array(toWorkspaceProductXlsxBuffer(toWorkspaceProductExportRows(rows))), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="master-produk-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request tidak valid" }, { status: authErrorStatus(error) ?? 400 });
  }
});
