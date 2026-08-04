import { NextResponse } from "next/server";
import { updateMembershipSchema } from "@/lib/membership-contracts";
import { authErrorStatus, requireRole } from "@/server/auth/guards";
import { revalidateAnalytics } from "@/server/analytics/cache";
import { updateMembership } from "@/server/membership/service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN", "CRM");
    const { id } = await context.params;
    const customerId = Number(id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: "customerId tidak valid" }, { status: 400 });
    }

    const body = updateMembershipSchema.parse(await request.json());
    const result = await updateMembership({
      customerId,
      status: body.status,
      groupName: body.groupName ?? null,
      joinedAt: body.joinedAt ?? null,
      picUserId: body.picUserId ?? null,
      notes: body.notes ?? null,
      updatedByUserId: Number(user.id),
    });

    // has_group -> cluster berubah, agregat analytics ikut basi.
    revalidateAnalytics();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: authErrorStatus(error) ?? 400 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Request tidak valid";
}
