/**
 * SHARED — pemetaan baris produk Pesanan: detail (DB) → form state → payload.
 * Fungsi murni, tanpa React dan tanpa I/O, supaya jalur BUG-W01 bisa diuji
 * tanpa merender komponen (test runner project ini `environment: node`).
 *
 * BUG-W01: backend hanya bisa mempertahankan snapshot harga/HPP item lama kalau
 * payload edit membawa `id` baris `workspace_order_items` yang sudah tersimpan.
 * Dua fungsi di bawah adalah satu-satunya tempat identitas itu diteruskan.
 */
import type { WorkspaceItemType } from "./workspace-pesanan-contracts";

export type PesananItemRowSource = {
  id: number;
  productInternalId: number;
  itemType: WorkspaceItemType;
  quantity: string;
};

export type PesananItemRow = {
  key: string;
  rowKind: "SALE" | "BONUS_SAMPLE";
  /** id baris DB — undefined untuk baris yang baru ditambahkan user. */
  existingItemId?: number;
  productInternalId: number | null;
  itemType: WorkspaceItemType;
  quantity: string;
};

export type PesananItemPayload = {
  id?: number;
  productInternalId: number;
  itemType: WorkspaceItemType;
  quantity: number;
};

/** Detail pesanan (DB) → baris form. Identitas baris DB ikut dibawa. */
export function toPesananItemRows(items: PesananItemRowSource[]): PesananItemRow[] {
  return items.map((item) => ({
    key: `existing-${item.id}`,
    rowKind: item.itemType === "SALE" ? "SALE" : "BONUS_SAMPLE",
    existingItemId: item.id,
    productInternalId: item.productInternalId,
    itemType: item.itemType,
    quantity: item.quantity,
  }));
}

/**
 * Baris form → payload update.
 *
 * - Baris tanpa produk dibuang (belum dipilih user).
 * - `id` HANYA disertakan untuk baris yang sudah ada di DB; baris baru sengaja
 *   tidak membawanya supaya backend mengambil harga/HPP Master Produk terkini.
 * - TIDAK pernah mengirim harga/HPP: snapshot sepenuhnya ditentukan backend.
 */
export function toPesananItemPayload(
  rows: PesananItemRow[],
  toQuantity: (value: string) => number
): PesananItemPayload[] {
  return rows
    .filter((row) => row.productInternalId != null)
    .map((row) => ({
      ...(row.existingItemId === undefined ? {} : { id: row.existingItemId }),
      productInternalId: row.productInternalId!,
      itemType: row.itemType,
      quantity: toQuantity(row.quantity),
    }));
}
