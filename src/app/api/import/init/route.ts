import { NextResponse } from "next/server";
import { importInitSchema } from "@/lib/import-contracts";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { assertDatabaseAllColumns, initDatabaseAllImport } from "@/server/import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const input = importInitSchema.parse(await request.json());
    assertDatabaseAllColumns(input.headers);
    return NextResponse.json(await initDatabaseAllImport(input));
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: authErrorStatus(error) ?? 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Request tidak valid"; }
