import { notFound } from "next/navigation";
import { loadWorkspaceProductOptionsAction } from "@/app/workspace-master-data-actions";
import { loadActiveCrmUsersAction, loadWorkspacePesananDetailAction } from "@/app/workspace-pesanan-actions";
import { AppShell } from "@/components/layout/app-shell";
import { PesananForm } from "@/components/workspace/pesanan-form";
import { requireCrmPermission } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function WorkspacePesananEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Guard halaman berjalan paralel dengan pemuatan data: tiap action di bawah
  // sudah men-guard dirinya sendiri (crm.order.read / crm.product.read), jadi
  // menunggu requireCrmPermission selesai dulu sebelum memuat data hanya
  // menambah satu round trip serial tanpa menambah keamanan.
  const [, detail, productOptions, crmOptions] = await Promise.all([
    requireCrmPermission("crm.order.update"),
    loadWorkspacePesananDetailAction(Number(id)),
    loadWorkspaceProductOptionsAction(),
    loadActiveCrmUsersAction(),
  ]);
  if (!detail) notFound();
  // Edit dibolehkan untuk SEMUA status (keputusan eksplisit — koreksi
  // kesalahan input manual masih sering terjadi walau pesanan sudah
  // CONFIRMED/RETURNED/dst). Guard status hanya tersisa di updateWorkspaceOrder
  // untuk baris yang sudah di-soft-delete (WorkspaceOrderNotFoundError).

  return (
    <AppShell title={`Edit Pesanan — ${detail.orderNumber}`}>
      <PesananForm
        mode="edit"
        orderId={detail.id}
        initialDetail={detail}
        productOptions={productOptions}
        crmOptions={crmOptions}
        defaultCrmUserId={detail.crmUserId ? String(detail.crmUserId) : ""}
      />
    </AppShell>
  );
}
