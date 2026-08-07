import { NextResponse } from "next/server";
import { authErrorStatus, requireCrmPermission } from "@/server/auth/guards";
import { WORKSPACE_EXPORT_MAX_ROWS } from "@/lib/list-chunk";
import { workspaceCostFilterSchema } from "@/lib/workspace-cost-contracts";
import { listWorkspaceCosts } from "@/server/workspace/costs";
import { toWorkspaceCostExportRows, toWorkspaceCostXlsxBuffer } from "@/server/workspace/costs-export";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";

export const GET = withTiming("/api/workspace/biaya-operasional/export.xlsx", async (request) => {
  try {
    await requireCrmPermission("crm.com.export");
    const params = new URL(request.url).searchParams;
    const filter = {
      ...workspaceCostFilterSchema.parse(Object.fromEntries(params)),
      page: 1,
      perPage: WORKSPACE_EXPORT_MAX_ROWS,
    };
    const { rows } = await listWorkspaceCosts(filter);
    return new NextResponse(new Uint8Array(toWorkspaceCostXlsxBuffer(toWorkspaceCostExportRows(rows))), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="biaya-operasional-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request tidak valid" }, { status: authErrorStatus(error) ?? 400 });
  }
});
