import { NextResponse } from "next/server";
import { importBatchSchema } from "@/lib/import-contracts";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { revalidateAnalytics } from "@/server/analytics/cache";
import { commitDatabaseAllImport, ImportBusyError } from "@/server/import";
import { withTiming } from "@/server/monitoring/with-timing";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withTiming("/api/import/commit", async (request) => {
  try {
    await requireRole("ADMIN");
    const { batchId } = importBatchSchema.parse(await request.json());
    const result = await commitDatabaseAllImport(batchId);
    // Dataset baru aktif -> seluruh agregat (Dashboard/Cohort/Frequency/RFM)
    // wajib dihitung ulang pada permintaan berikutnya.
    revalidateAnalytics();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: message(error) },
      { status: authErrorStatus(error) ?? (error instanceof ImportBusyError ? 409 : 400) }
    );
  }
});

function message(error: unknown) { return error instanceof Error ? error.message : "Request tidak valid"; }
