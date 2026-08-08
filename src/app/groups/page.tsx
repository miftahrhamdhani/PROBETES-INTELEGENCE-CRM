import { loadPics } from "@/app/customers-actions";
import {
  loadGroupMembersAction,
  loadGroupMembershipKpiAction,
  loadGroupNamesAction,
} from "@/app/group-membership-actions";
import { AppShell } from "@/components/layout/app-shell";
import { GroupMemberFilterBar } from "@/components/filters/group-member-filter-bar";
import { GroupImportButton } from "@/components/customer/group-import-button";
import { GroupMemberTable } from "@/components/customer/group-member-table";
import { GroupMembershipKpiGrid } from "@/components/customer/group-membership-kpi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Customer > Group Membership — HANYA customer yang SUDAH masuk Grup Konsultasi.
 *
 * Baris NOT_GROUPED/UNKNOWN tetap ada di database (dipakai cluster engine lewat
 * COALESCE(gm.status,'NOT_GROUPED')), tapi sengaja tidak pernah ditampilkan di
 * sini — halaman ini adalah daftar member grup, bukan daftar seluruh customer.
 *
 * Sumber data sama dengan aksi manual "Masukkan ke Grup" di Customers:
 * tabel `customer_group_memberships` (SSOT tunggal).
 */
export default async function GroupMembershipPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filter = {
    search: first(params.search),
    cluster: first(params.cluster),
    groupName: first(params.groupName),
    pic: first(params.pic),
    joinedFrom: first(params.joinedFrom),
    joinedTo: first(params.joinedTo),
    page: first(params.page) ? Number(first(params.page)) : 1,
    perPage: first(params.perPage) ? Number(first(params.perPage)) : 25,
  };

  let list;
  let kpi;
  let picOptions: { id: number; name: string }[];
  let groupOptions: string[];
  try {
    [list, kpi, picOptions, groupOptions] = await Promise.all([
      loadGroupMembersAction(filter),
      loadGroupMembershipKpiAction(),
      loadPics(),
      loadGroupNamesAction(),
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

  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = first(value);
      if (single) query.set(key, single);
    }
    for (const [key, value] of Object.entries(patch)) query.set(key, value);
    return `/groups?${query.toString()}`;
  };
  const totalPages = Math.max(Math.ceil(list.total / list.perPage), 1);
  const currentPage = Math.min(list.page, totalPages);

  return (
    <AppShell title="Group Membership">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Kelola data customer yang sudah masuk Grup Konsultasi.
          </p>
          <GroupImportButton />
        </div>

        <GroupMembershipKpiGrid kpi={kpi} />

        <Card>
          <CardContent className="pt-5">
            <GroupMemberFilterBar picOptions={picOptions} groupOptions={groupOptions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Daftar Member Grup</CardTitle>
              <CardDescription className="mt-0.5">
                {list.total === 0
                  ? "Belum ada customer yang masuk Grup Konsultasi."
                  : `${list.total.toLocaleString("id-ID")} member grup · klik baris untuk melihat detail.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <GroupMemberTable
              rows={list.rows}
              rowNumberOffset={(currentPage - 1) * list.perPage}
              picOptions={picOptions}
              groupOptions={groupOptions}
            />
            <Pagination
              page={currentPage}
              perPage={list.perPage}
              total={list.total}
              label="member grup"
              prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
              nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
              perPageHrefs={{
                25: hrefWith({ perPage: "25", page: "1" }),
                50: hrefWith({ perPage: "50", page: "1" }),
                100: hrefWith({ perPage: "100", page: "1" }),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
