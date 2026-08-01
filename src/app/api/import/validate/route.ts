import { NextResponse } from "next/server";
import { importBatchSchema } from "@/lib/import-contracts";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { validateDatabaseAllImport } from "@/server/import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const { batchId } = importBatchSchema.parse(await request.json());
    return NextResponse.json(await validateDatabaseAllImport(batchId));
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: authErrorStatus(error) ?? 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Request tidak valid"; }
