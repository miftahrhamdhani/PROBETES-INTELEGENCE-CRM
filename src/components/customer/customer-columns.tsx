import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import { formatDate, formatRupiah } from "@/lib/format";
import type { ClusterCustomerRow, CustomerListRow } from "@/lib/customer-types";
import { MEMBERSHIP_STATUS_LABELS, type MembershipStatusValue } from "@/lib/membership-contracts";

export function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "—";
  return (CLUSTER_LABELS as Record<string, string>)[code] ?? (NON_CLUSTER_LABELS as Record<string, string>)[code] ?? code;
}

export const MEMBERSHIP_VARIANT: Record<MembershipStatusValue, "success" | "outline" | "warning"> = {
  GROUPED: "success",
  NOT_GROUPED: "outline",
  UNKNOWN: "warning",
};

/** Kolom fokus RFM — dipakai /customers dan preview di /cluster. */
export function buildCustomerColumns(detailHref: (id: number) => string): ColumnDef<CustomerListRow, any>[] {
  return [
    {
      id: "phone",
      header: "No HP",
      size: 150,
      accessorKey: "normalizedPhone",
      cell: ({ row }) => (
        <Link href={detailHref(row.original.customerId)} className="font-medium text-primary underline decoration-primary/30" onClick={(e) => e.stopPropagation()}>
          {row.original.normalizedPhone}
        </Link>
      ),
    },
    {
      id: "name",
      header: "Nama",
      size: 180,
      accessorKey: "displayName",
      cell: ({ row }) => row.original.displayName,
    },
    {
      id: "recency",
      header: "R",
      size: 70,
      cell: ({ row }) => <span className="tabular">{row.original.recencyDays != null ? `${row.original.recencyDays}d` : "—"}</span>,
    },
    {
      id: "frequency",
      header: "F",
      size: 70,
      cell: ({ row }) => <Badge variant="secondary">{row.original.frequency}×</Badge>,
    },
    {
      id: "monetary",
      header: "M",
      size: 140,
      cell: ({ row }) => <span className="font-medium tabular">{formatRupiah(row.original.monetary)}</span>,
    },
    {
      id: "cluster",
      header: "Cluster",
      size: 110,
      cell: ({ row }) => <Badge variant="outline">{clusterLabel(row.original.clusterCode)}</Badge>,
    },
    {
      id: "membershipStatus",
      header: "Status Grup",
      size: 130,
      cell: ({ row }) => (
        <Badge variant={MEMBERSHIP_VARIANT[row.original.membershipStatus]}>{MEMBERSHIP_STATUS_LABELS[row.original.membershipStatus]}</Badge>
      ),
    },
    {
      id: "groupName",
      header: "Nama Grup",
      size: 160,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.groupName ?? "—"}</span>,
    },
    {
      id: "pic",
      header: "PIC",
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.picName ?? "—"}</span>,
    },
    {
      id: "lastOrder",
      header: "Last Order",
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastOrderDate)}</span>,
    },
    {
      id: "cs",
      header: "CS",
      size: 140,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.csNames}>
          {row.original.csNames}
        </span>
      ),
    },
  ];
}

/**
 * Kolom wajib tabel Customer Cluster (permintaan produk): No HP, Nama, Total
 * Belanja, Total Fisik, Frequency, Hari Sejak Beli, Pertama Beli, Status Grup,
 * Produk yang Dibeli, CS. Nomor baris ditambahkan otomatis oleh DataTable.
 */
export function buildClusterCustomerColumns(detailHref: (id: number) => string): ColumnDef<ClusterCustomerRow, any>[] {
  return [
    {
      id: "phone",
      header: "No HP",
      size: 150,
      cell: ({ row }) => (
        <Link href={detailHref(row.original.customerId)} className="font-medium text-primary underline decoration-primary/30" onClick={(e) => e.stopPropagation()}>
          {row.original.normalizedPhone}
        </Link>
      ),
    },
    {
      id: "name",
      header: "Nama",
      size: 180,
      cell: ({ row }) => row.original.displayName,
    },
    {
      id: "totalBelanja",
      header: "Total Belanja",
      size: 140,
      cell: ({ row }) => <span className="font-medium tabular">{formatRupiah(row.original.totalBelanja)}</span>,
    },
    {
      id: "totalFisik",
      header: "Total Fisik",
      size: 140,
      cell: ({ row }) => <span className="tabular">{formatRupiah(row.original.totalFisik)}</span>,
    },
    {
      id: "frequency",
      header: "Frequency",
      size: 100,
      cell: ({ row }) => <Badge variant="secondary">{row.original.frequency}×</Badge>,
    },
    {
      id: "recency",
      header: "Hari Sejak Beli",
      size: 130,
      cell: ({ row }) => <span className="tabular">{row.original.recencyDays != null ? `${row.original.recencyDays} hari` : "—"}</span>,
    },
    {
      id: "firstOrder",
      header: "Pertama Beli",
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.firstOrderDate)}</span>,
    },
    {
      id: "membershipStatus",
      header: "Status Grup",
      size: 130,
      cell: ({ row }) => (
        <Badge variant={MEMBERSHIP_VARIANT[row.original.membershipStatus]}>{MEMBERSHIP_STATUS_LABELS[row.original.membershipStatus]}</Badge>
      ),
    },
    {
      id: "products",
      header: "Produk yang Dibeli",
      size: 280,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.productsPurchased}>
          {row.original.productsPurchased}
        </span>
      ),
    },
    {
      id: "cs",
      header: "CS",
      size: 140,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.csNames}>
          {row.original.csNames}
        </span>
      ),
    },
  ];
}

/** Kolom fokus operasional Group Membership — status grup, PIC, alasan review. */
export function buildGroupMembershipColumns(detailHref: (id: number) => string): ColumnDef<CustomerListRow, any>[] {
  return [
    {
      id: "name",
      header: "Nama",
      size: 180,
      cell: ({ row }) => (
        <Link href={detailHref(row.original.customerId)} className="font-medium text-primary underline decoration-primary/30" onClick={(e) => e.stopPropagation()}>
          {row.original.displayName}
        </Link>
      ),
    },
    {
      id: "phone",
      header: "No HP",
      size: 150,
      cell: ({ row }) => <span className="tabular">{row.original.normalizedPhone}</span>,
    },
    {
      id: "cluster",
      header: "Current Cluster",
      size: 130,
      cell: ({ row }) => <Badge variant="outline">{clusterLabel(row.original.clusterCode)}</Badge>,
    },
    {
      id: "membershipStatus",
      header: "Status Grup",
      size: 130,
      cell: ({ row }) => (
        <Badge variant={MEMBERSHIP_VARIANT[row.original.membershipStatus]}>{MEMBERSHIP_STATUS_LABELS[row.original.membershipStatus]}</Badge>
      ),
    },
    {
      id: "groupName",
      header: "Nama Grup",
      size: 170,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.groupName ?? "—"}</span>,
    },
    {
      id: "pic",
      header: "PIC",
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.picName ?? "—"}</span>,
    },
    {
      id: "lastOrder",
      header: "Last Order",
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastOrderDate)}</span>,
    },
    {
      id: "reviewReason",
      header: "Review reason",
      size: 260,
      cell: ({ row }) =>
        row.original.reviewReason ? (
          <span className="text-muted-foreground" title={row.original.reviewReason}>
            {row.original.reviewReason}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}
