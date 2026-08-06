import type { WorkspaceOrderStatus } from "./workspace-pesanan-contracts";

/**
 * SHARED — pure mapping status transaksi sumber Database All -> status
 * Pesanan Workspace (docs prompt perbaikan §5). Sengaja TIDAK mengumpulkan
 * seluruh status non-CANCELLED ke CONFIRMED — setiap status sumber punya
 * tujuan eksplisit, dan ADJUSTED ditahan (bukan ditebak) karena sumber
 * Database All tidak menyediakan nilai delta adjustment yang bisa dipercaya.
 */
export type ImportTransactionStatus =
  | "CONFIRMED"
  | "CANCELLED"
  | "COD_FAILED"
  | "RETURNED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "ADJUSTED";

export type ImportStatusMapping = { action: "INSERT"; status: WorkspaceOrderStatus } | { action: "HOLD"; reason: string };

export function mapImportStatusToWorkspace(sourceStatus: ImportTransactionStatus): ImportStatusMapping {
  switch (sourceStatus) {
    case "CONFIRMED":
      return { action: "INSERT", status: "CONFIRMED" };
    case "CANCELLED":
      return { action: "INSERT", status: "CANCELLED" };
    // COD_FAILED = pesanan tidak pernah terbayar/terkirim — setara CANCELLED
    // untuk tujuan KPI (tidak pernah closing), bukan status tersendiri.
    case "COD_FAILED":
      return { action: "INSERT", status: "CANCELLED" };
    case "RETURNED":
      return { action: "INSERT", status: "RETURNED" };
    case "REFUNDED":
      return { action: "INSERT", status: "REFUNDED" };
    case "PARTIALLY_REFUNDED":
      return { action: "INSERT", status: "PARTIALLY_REFUNDED" };
    // ADJUSTED butuh nilai delta eksplisit yang tidak tersedia dari parser
    // Database All saat ini — tahan record, jangan menebak nilainya.
    case "ADJUSTED":
      return {
        action: "HOLD",
        reason: "Status ADJUSTED memerlukan nilai adjustment eksplisit yang tidak tersedia dari sumber Database All — tidak diproses otomatis.",
      };
  }
}

/** Status yang masuk KPI (§Aturan KPI) — satu-satunya sumber kebenaran dipakai
 *  baik oleh dokumentasi maupun test; query KPI aktual tetap literal
 *  `status = 'CONFIRMED'` di SQL (lihat pesanan.ts/pesanan-overview.ts). */
export const KPI_ELIGIBLE_STATUS: WorkspaceOrderStatus = "CONFIRMED";
