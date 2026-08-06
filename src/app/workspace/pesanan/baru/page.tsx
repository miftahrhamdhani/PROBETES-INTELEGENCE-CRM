import { loadWorkspaceProductOptionsAction } from "@/app/workspace-master-data-actions";
import { loadActiveCrmUsersAction } from "@/app/workspace-pesanan-actions";
import { AppShell } from "@/components/layout/app-shell";
import { PesananForm } from "@/components/workspace/pesanan-form";
import { requireCrmPermission } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function WorkspacePesananBaruPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [user, productOptions, crmOptions] = await Promise.all([
    requireCrmPermission("crm.order.create"),
    loadWorkspaceProductOptionsAction(),
    loadActiveCrmUsersAction(),
  ]);
  const sessionCrmMatch = crmOptions.find((c) => c.name.trim().toLocaleUpperCase("id-ID") === user.name.trim().toLocaleUpperCase("id-ID"));
  const taskId = typeof params.taskId === "string" ? Number(params.taskId) : undefined;
  const customerName = typeof params.customerName === "string" ? params.customerName : undefined;
  const phone = typeof params.phone === "string" ? params.phone : undefined;

  return (
    <AppShell title="Input Pesanan">
      <PesananForm
        mode="create"
        productOptions={productOptions}
        crmOptions={crmOptions}
        defaultCrmUserId={sessionCrmMatch ? String(sessionCrmMatch.id) : ""}
        initialTaskId={taskId}
        prefill={customerName || phone ? { customerName, phone } : undefined}
      />
    </AppShell>
  );
}
