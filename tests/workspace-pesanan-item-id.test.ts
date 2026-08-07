/**
 * BUG-W01 — jalur identitas item: DB → Detail Pesanan → Form Edit → Payload.
 *
 * Backend sudah bisa mempertahankan snapshot harga/HPP, TAPI hanya kalau
 * payload edit membawa `id` baris workspace_order_items. Test ini menjaga
 * sambungan itu: kalau `id` berhenti diteruskan, snapshot pesanan historis
 * diam-diam ikut berubah lagi saat Master Produk diedit.
 *
 * Yang diuji adalah fungsi pemetaan YANG BENAR-BENAR DIPAKAI pesanan-form.tsx
 * (bukan salinan), sehingga test ini tidak bisa lulus sementara form-nya salah.
 */
import { describe, expect, it } from "vitest";
import {
  toPesananItemPayload,
  toPesananItemRows,
  type PesananItemRow,
} from "@/lib/workspace-pesanan-item-mapping";
import { workspaceOrderItemBodySchema } from "@/lib/workspace-pesanan-contracts";

const num = (v: string) => Number(v);

/** Detail pesanan lama dari DB: Produk A (id item 77), harga snapshot 75.000. */
const DETAIL_ITEMS = [
  { id: 77, productInternalId: 5, itemType: "SALE" as const, quantity: "2" },
];

function bukaFormEdit(): PesananItemRow[] {
  return toPesananItemRows(DETAIL_ITEMS);
}

describe("Detail Pesanan → Form Edit", () => {
  it("membawa id baris DB ke form state (tidak ditampilkan di UI)", () => {
    const rows = bukaFormEdit();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.existingItemId).toBe(77);
    expect(rows[0]!.productInternalId).toBe(5);
    expect(rows[0]!.key).toBe("existing-77");
  });
});

describe("Form Edit → Payload", () => {
  it("TEST 1 — ubah memo saja: payload tetap membawa items[0].id", () => {
    // Mengubah memo tidak menyentuh baris produk sama sekali.
    const payload = toPesananItemPayload(bukaFormEdit(), num);
    expect(payload[0]!.id).toBe(77);
    expect(payload[0]!.productInternalId).toBe(5);
  });

  it("TEST 2 — ubah alamat saja: id tetap terbawa", () => {
    const payload = toPesananItemPayload(bukaFormEdit(), num);
    expect(payload[0]).toMatchObject({ id: 77, productInternalId: 5, quantity: 2 });
  });

  it("TEST 3 — qty 2 -> 3: id tetap, hanya quantity berubah", () => {
    const rows = bukaFormEdit();
    rows[0]!.quantity = "3";
    const payload = toPesananItemPayload(rows, num);
    expect(payload[0]!.id).toBe(77);
    expect(payload[0]!.quantity).toBe(3);
  });

  it("TEST 4 — tambah Produk B: item lama ber-id, item baru TANPA id", () => {
    const rows = bukaFormEdit();
    rows.push({
      key: "row-1",
      rowKind: "SALE",
      productInternalId: 9, // Produk B
      itemType: "SALE",
      quantity: "1",
    });
    const payload = toPesananItemPayload(rows, num);
    expect(payload).toHaveLength(2);
    expect(payload[0]!.id).toBe(77);
    // Item baru tidak boleh punya properti `id` sama sekali (bukan id: undefined),
    // supaya backend memperlakukannya sebagai item baru.
    expect("id" in payload[1]!).toBe(false);
    expect(payload[1]!.productInternalId).toBe(9);
  });

  it("TEST 5 — ganti Produk A -> Produk C: id TETAP dikirim bersama productId baru", () => {
    const rows = bukaFormEdit();
    rows[0]!.productInternalId = 12; // Produk C
    const payload = toPesananItemPayload(rows, num);
    // Backend yang memutuskan snapshot baru; frontend hanya melaporkan fakta
    // "baris 77 sekarang menunjuk produk 12".
    expect(payload[0]!.id).toBe(77);
    expect(payload[0]!.productInternalId).toBe(12);
  });

  it("item dihapus user tidak ikut terkirim", () => {
    const payload = toPesananItemPayload([], num);
    expect(payload).toHaveLength(0);
  });

  it("baris yang produknya belum dipilih dibuang", () => {
    const rows: PesananItemRow[] = [
      { key: "row-1", rowKind: "SALE", productInternalId: null, itemType: "SALE", quantity: "1" },
    ];
    expect(toPesananItemPayload(rows, num)).toHaveLength(0);
  });

  it("frontend TIDAK mengirim harga/HPP — snapshot tetap urusan backend", () => {
    const payload = toPesananItemPayload(bukaFormEdit(), num);
    expect(Object.keys(payload[0]!).sort()).toEqual(["id", "itemType", "productInternalId", "quantity"]);
  });
});

describe("Payload lolos kontrak backend", () => {
  it("item existing (dengan id) valid menurut schema Zod backend", () => {
    const payload = toPesananItemPayload(bukaFormEdit(), num);
    const parsed = workspaceOrderItemBodySchema.safeParse(payload[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.id).toBe(77);
  });

  it("item baru (tanpa id) tetap valid — create tidak terpengaruh", () => {
    const rows: PesananItemRow[] = [
      { key: "row-1", rowKind: "SALE", productInternalId: 9, itemType: "SALE", quantity: "1" },
    ];
    const parsed = workspaceOrderItemBodySchema.safeParse(toPesananItemPayload(rows, num)[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.id).toBeUndefined();
  });
});

describe("Form benar-benar memakai pemetaan ini (bukan salinan lokal)", () => {
  it("pesanan-form.tsx memanggil kedua fungsi pemetaan", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/workspace/pesanan-form.tsx"), "utf8");
    expect(src).toContain("toPesananItemRows(detail.items)");
    expect(src).toContain("toPesananItemPayload(validItems, num)");
  });
});
