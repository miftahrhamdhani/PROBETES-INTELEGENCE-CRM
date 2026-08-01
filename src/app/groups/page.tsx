import { loadCustomerList, loadMembershipSummary, loadPics } from "@/app/customers-actions";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { CustomerSearchFilter } from "@/components/filters/customer-search-filter";
import { CustomerDetailSheet } from "@/components/customer/customer-detail-sheet";
import { GroupMembershipSummary } from "@/components/customer/group-membership-summary";
import { CustomerListTable, type CustomerListFilterInput } from "@/components/customer/customer-list-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";
import {
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  type MembershipStatusValue,
} from "@/lib/membership-contracts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clusterLabel(code: string): string {
  return (
    (CLUSTER_LABELS as Record<string, string>)[code] ??
    (NON_CLUSTER_LABELS as Record<string, string>)[code] ??
    code
  );
}

function asMembershipFilter(value: string | undefined): MembershipStatusValue | "CONFLICT" | undefined {
  if (value === "CONFLICT") return "CONFLICT";
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as MembershipStatusValue)
    : undefined;
}

function membershipFilterLabel(value: MembershipStatusValue | "CONFLICT"): string {
  return value === "CONFLICT" ? "Konflik (belum diselesaikan)" : MEMBERSHIP_STATUS_LABELS[value];
}

/**
 * Customer > Group Membership — halaman operasional CRM untuk mengelola status
 * grup. Sumber data 100% sama dengan Customer All (listCustomers, getMembershipSummary
 * di src/server/analytics/customers.ts) — tidak ada mock/static data di sini.
 */
export default async function GroupMembershipPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = first(params.search);
  const cluster = first(params.cluster);
  const membershipStatus = asMembershipFilter(first(params.membershipStatus));
  const pic = first(params.pic);
  const orderDateFrom = first(params.from);
  const orderDateTo = first(params.to);

  const filter: CustomerListFilterInput = {
    search,
    cluster,
    membershipStatus,
    pic,
    orderDateFrom,
    orderDateTo,
  };

  let initialData;
  let picOptions: { id: number; name: string }[];
  let summary;
  try {
    [initialData, picOptions, summary] = await Promise.all([
      loadCustomerList({ ...filter, page: 1, perPage: CUSTOMER_LIST_CHUNK }),
      loadPics(),
      loadMembershipSummary(),
    ]);
  } catch {
    return (
      <AppShell title="Group Membership">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Belum ada batch Database All aktif, atau koneksi database gagal.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const activeFilters: { label: string; clearHref: string }[] = [];
  if (cluster) {
    const query = new URLSearchParams(queryWithout(params, ["cluster"]));
    activeFilters.push({ label: `Cluster: ${clusterLabel(cluster)}`, clearHref: `/groups?${query.toString()}` });
  }
  if (membershipStatus) {
    const query = new URLSearchParams(queryWithout(params, ["membershipStatus"]));
    activeFilters.push({
      label: `Status Grup: ${membershipFilterLabel(membershipStatus)}`,
      clearHref: `/groups?${query.toString()}`,
    });
  }
  if (pic) {
    const query = new URLSearchParams(queryWithout(params, ["pic"]));
    activeFilters.push({ label: `PIC: ${pic}`, clearHref: `/groups?${query.toString()}` });
  }
  if (orderDateFrom) {
    const query = new URLSearchParams(queryWithout(params, ["from", "to"]));
    activeFilters.push({ label: `Order: ${orderDateFrom} – ${orderDateTo ?? orderDateFrom}`, clearHref: `/groups?${query.toString()}` });
  }

  return (
    <AppShell title="Group Membership">
      <div className="space-y-4">
        <GroupMembershipSummary summary={summary} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CustomerSearchFilter csOptions={[]} picOptions={picOptions} showCsFilter={false} showConflictOption />
          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map((f) => (
                <a key={f.label} href={f.clearHref}>
                  <Badge variant="secondary" className="cursor-pointer hover:opacity-70">
                    {f.label} ✕
                  </Badge>
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{initialData.total.toLocaleString("id-ID")} customer</CardTitle>
              <CardDescription>Klik baris untuk buka CRM Enrichment · scroll untuk memuat lebih banyak</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <CustomerListTable variant="group" filter={filter} initialData={initialData} />
          </CardContent>
        </Card>
      </div>

      <CustomerDetailSheet picOptions={picOptions} />
    </AppShell>
  );
}

function queryWithout(params: SearchParams, exclude: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single && !exclude.includes(key)) query.set(key, single);
  }
  return query;
}
