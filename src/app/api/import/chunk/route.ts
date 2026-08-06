import { NextResponse } from "next/server";
import { importChunkSchema } from "@/lib/import-contracts";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { stageDatabaseAllRows } from "@/server/import";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";

export const POST = withTiming("/api/import/chunk", async (request) => {
  try {
    await requireRole("ADMIN");
    const input = importChunkSchema.parse(await request.json());
    await stageDatabaseAllRows(input.batchId, input.rows);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: authErrorStatus(error) ?? 400 });
  }
});

function message(error: unknown) { return error instanceof Error ? error.message : "Request tidak valid"; }
