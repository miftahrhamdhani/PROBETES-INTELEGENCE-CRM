import Link from "next/link";
import { Sparkles } from "lucide-react";
import { loadCsAgents, loadCustomerList, loadPics } from "@/app/customers-actions";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { CustomerSearchFilter } from "@/components/filters/customer-search-filter";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { CustomerDetailSheet } from "@/components/customer/customer-detail-sheet";
import { BroadcastExportButton } from "@/components/customer/broadcast-export-button";
import { CustomerListTable } from "@/components/customer/customer-list-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";
import {
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  type MembershipStatusValue,
} from "@/lib/membership-contracts";

function asMembershipStatus(value: string | undefined): MembershipStatusValue | undefined {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as MembershipStatusValue)
    : undefined;
}

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

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = first(params.search);
  const cs = first(params.cs);
  const cluster = first(params.cluster);
  const membershipStatus = first(params.membershipStatus);
  const pic = first(params.pic);
  const cohortMonth = first(params.cohortMonth);
  const frequencyRaw = first(params.frequency);
  const frequencyMinRaw = first(params.frequencyMin);
  const activeMonthIndexRaw = first(params.activeMonthIndex);
  const orderNumberRaw = first(params.orderNumber);
  const orderDateFrom = first(params.from);
  const orderDateTo = first(params.to);
  const recencyMinRaw = first(params.recencyMin);
  const recencyMaxRaw = first(params.recencyMax);
  const monetaryMinRaw = first(params.monetaryMin);
  const monetaryMaxRaw = first(params.monetaryMax);
  const isNewRaw = first(params.isNew);

  const filter = {
    search,
    cs,
    cluster,
    membershipStatus: asMembershipStatus(membershipStatus),
    pic,
    cohortMonth,
    frequency: frequencyRaw ? Number(frequencyRaw) : undefined,
    frequencyMin: frequencyMinRaw ? Number(frequencyMinRaw) : undefined,
    activeMonthIndex: activeMonthIndexRaw ? Number(activeMonthIndexRaw) : undefined,
    orderNumber: orderNumberRaw ? Number(orderNumberRaw) : undefined,
    orderDateFrom,
    orderDateTo,
    recencyMin: recencyMinRaw ? Number(recencyMinRaw) : undefined,
    recencyMax: recencyMaxRaw ? Number(recencyMaxRaw) : undefined,
    monetaryMin: monetaryMinRaw ? Number(monetaryMinRaw) : undefined,
    monetaryMax: monetaryMaxRaw ? Number(monetaryMaxRaw) : undefined,
    isNew: isNewRaw === "1" ? true : undefined,
  };

  let initialData;
  let csOptions: string[];
  let picOptions: { id: number; name: string }[];
  try {
    [initialData, csOptions, picOptions] = await Promise.all([
      loadCustomerList({ ...filter, page: 1, perPage: CUSTOMER_LIST_CHUNK }),
      loadCsAgents(),
      loadPics(),
    ]);
  } catch {
    return (
      <AppShell title="Customers">
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
    activeFilters.push({ label: `Cluster: ${clusterLabel(cluster)}`, clearHref: `/customers?${query.toString()}` });
  }
  if (filter.membershipStatus) {
    const query = new URLSearchParams(queryWithout(params, ["membershipStatus"]));
    activeFilters.push({
      label: `Status Grup: ${MEMBERSHIP_STATUS_LABELS[filter.membershipStatus]}`,
      clearHref: `/customers?${query.toString()}`,
    });
  }
  if (pic) {
    const query = new URLSearchParams(queryWithout(params, ["pic"]));
    activeFilters.push({ label: `PIC: ${pic}`, clearHref: `/customers?${query.toString()}` });
  }
  if (cohortMonth) {
    const query = new URLSearchParams(queryWithout(params, ["cohortMonth", "activeMonthIndex", "orderNumber"]));
    const detail =
      activeMonthIndexRaw != null
        ? `Cohort ${cohortMonth} · aktif M${activeMonthIndexRaw}`
        : orderNumberRaw != null
          ? `Cohort ${cohortMonth} · mencapai F${orderNumberRaw}`
          : `Cohort ${cohortMonth}`;
    activeFilters.push({ label: detail, clearHref: `/customers?${query.toString()}` });
  }
  if (frequencyRaw) {
    const query = new URLSearchParams(queryWithout(params, ["frequency"]));
    activeFilters.push({ label: `Frequency = ${frequencyRaw}`, clearHref: `/customers?${query.toString()}` });
  }
  if (frequencyMinRaw) {
    const query = new URLSearchParams(queryWithout(params, ["frequencyMin"]));
    activeFilters.push({ label: `Frequency ≥ ${frequencyMinRaw}`, clearHref: `/customers?${query.toString()}` });
  }
  if (orderDateFrom) {
    const query = new URLSearchParams(queryWithout(params, ["from", "to"]));
    activeFilters.push({ label: `Order: ${orderDateFrom} – ${orderDateTo ?? orderDateFrom}`, clearHref: `/customers?${query.toString()}` });
  }
  if (recencyMinRaw || recencyMaxRaw) {
    const query = new URLSearchParams(queryWithout(params, ["recencyMin", "recencyMax"]));
    activeFilters.push({
      label: `Recency: ${recencyMinRaw ?? "0"}–${recencyMaxRaw ?? "+"} hari`,
      clearHref: `/customers?${query.toString()}`,
    });
  }
  if (monetaryMinRaw || monetaryMaxRaw) {
    const query = new URLSearchParams(queryWithout(params, ["monetaryMin", "monetaryMax"]));
    activeFilters.push({
      label: `Monetary: Rp ${(Number(monetaryMinRaw ?? 0)).toLocaleString("id-ID")}–${monetaryMaxRaw ? `Rp ${Number(monetaryMaxRaw).toLocaleString("id-ID")}` : "+"}`,
      clearHref: `/customers?${query.toString()}`,
    });
  }
  if (filter.isNew) {
    const query = new URLSearchParams(queryWithout(params, ["isNew"]));
    activeFilters.push({ label: "Customer Baru", clearHref: `/customers?${query.toString()}` });
  }

  return (
    <AppShell title="Customers">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{initialData.total.toLocaleString("id-ID")} customer</CardTitle>
            <CardDescription>Klik baris untuk detail lengkap · scroll untuk memuat lebih banyak</CardDescription>
          </div>
          {/* FR-24: export menghormati SELURUH filter aktif di halaman ini. */}
          <BroadcastExportButton filter={filter} expectedRows={initialData.total} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <CustomerSearchFilter csOptions={csOptions} picOptions={picOptions} />
              <DateRangeFilter />
              <NewCustomerToggle active={!!filter.isNew} params={params} />
            </div>
            {activeFilters.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {/* `next/link`, BUKAN <a>: <a> memicu full page reload — seluruh
                    app shell, bundle, dan sesi dimuat ulang hanya untuk membuang
                    satu filter. */}
                {activeFilters.map((f) => (
                  <Link key={f.label} href={f.clearHref} scroll={false}>
                    <Badge variant="secondary" className="cursor-pointer hover:opacity-70">
                      {f.label} ✕
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <CustomerListTable variant="customer" filter={filter} initialData={initialData} />
        </CardContent>
      </Card>

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

/** Toggle "Customer Baru" — customer yang first_seen_batch_id = batch Database
 *  All aktif saat ini (lihat isNew di analytics/customers.ts). Klik untuk
 *  menyalakan/mematikan filter tanpa kehilangan filter lain yang aktif. */
function NewCustomerToggle({ active, params }: { active: boolean; params: SearchParams }) {
  const href = active
    ? `/customers?${queryWithout(params, ["isNew"]).toString()}`
    : (() => {
        const query = queryWithout(params, []);
        query.set("isNew", "1");
        return `/customers?${query.toString()}`;
      })();

  return (
    <Link href={href}>
      <Badge variant={active ? "success" : "outline"} className="flex cursor-pointer items-center gap-1 hover:opacity-80">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        Customer Baru
      </Badge>
    </Link>
  );
}
