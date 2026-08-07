import { loadWorkspaceCostsAction } from "@/app/workspace-cost-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import { CostPageClient, type CostPermissions } from "@/components/workspace/cost-page-client";
import { requireCrmPermission } from "@/server/auth/guards";
import { roleHasCrmPermission } from "@/lib/crm-permissions";
import { workspaceCostFilterSchema } from "@/lib/workspace-cost-contracts";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspaceBiayaOperasionalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const defaults = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, first(value)]));
  const filter = workspaceCostFilterSchema.parse(defaults);

  const [user, { rows, total }] = await Promise.all([requireCrmPermission("crm.com.read"), loadWorkspaceCostsAction(filter)]);

  const permissions: CostPermissions = {
    create: roleHasCrmPermission(user.role, "crm.com.create"),
    update: roleHasCrmPermission(user.role, "crm.com.update_own_draft"),
    submit: roleHasCrmPermission(user.role, "crm.com.submit"),
    leaderVerify: roleHasCrmPermission(user.role, "crm.com.leader_verify"),
    spvApprove: roleHasCrmPermission(user.role, "crm.com.spv_approve"),
    directorApprove: roleHasCrmPermission(user.role, "crm.com.director_approve"),
    requestRevision: roleHasCrmPermission(user.role, "crm.com.request_revision"),
    reject: roleHasCrmPermission(user.role, "crm.com.reject"),
    cancel: roleHasCrmPermission(user.role, "crm.com.cancel"),
    export: roleHasCrmPermission(user.role, "crm.com.export"),
    auditRead: roleHasCrmPermission(user.role, "crm.audit.read"),
  };

  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams(defaults as Record<string, string>);
    for (const [key, value] of Object.entries(patch)) query.set(key, value);
    return `/workspace/biaya-operasional?${query}`;
  };
  const totalPages = Math.max(Math.ceil(total / filter.perPage), 1);
  const currentPage = Math.min(filter.page, totalPages);

  return (
    <AppShell title="Biaya Operasional" prominentTitle>
      <div className="space-y-4">
        <p className="-mt-3 max-w-3xl text-sm text-muted-foreground">
          Pencatatan dan persetujuan biaya COM CRM seperti Mekari, AI, WhatsApp API, broadcast, software CRM, dan kebutuhan marketing CRM lainnya.
        </p>
        <CostPageClient
          rows={rows}
          total={total}
          page={currentPage}
          perPage={filter.perPage}
          currentUser={{ id: Number(user.id), name: user.name, role: user.role }}
          permissions={permissions}
        />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Pagination
            page={currentPage}
            perPage={filter.perPage}
            total={total}
            label="biaya"
            prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
            nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
            perPageHrefs={{ 10: hrefWith({ perPage: "10", page: "1" }), 25: hrefWith({ perPage: "25", page: "1" }), 50: hrefWith({ perPage: "50", page: "1" }), 100: hrefWith({ perPage: "100", page: "1" }) }}
          />
        </div>
      </div>
    </AppShell>
  );
}
