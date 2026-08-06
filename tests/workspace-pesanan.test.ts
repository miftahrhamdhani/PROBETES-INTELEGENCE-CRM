import { describe, expect, it } from "vitest";
import { WORKSPACE_PRODUCT_SEED, allowedItemTypesForUsage } from "@/lib/workspace-product-seed";
import {
  calculateAov,
  calculatePendapatanBersih,
  calculateWorkspaceOrder,
  NegativeOrderTotalError,
} from "@/lib/workspace-pesanan-calculation";
import {
  availableStatusTargets,
  MOVE_LABEL_BY_TAB,
  MOVE_TARGETS_BY_TAB,
  workspaceOrderBodySchema,
  workspaceOrderBulkStatusChangeBodySchema,
  workspaceOrderDeleteBodySchema,
  workspaceOrderFilterSchema,
  workspaceOrderRefundBodySchema,
  WORKSPACE_PESANAN_TABS,
} from "@/lib/workspace-pesanan-contracts";
import {
  canCreateCost,
  COM_ELIGIBLE_STATUS,
  nextApprovalStage,
  requiredApproverRole,
  resolveCostRole,
  stageResultStatus,
} from "@/lib/workspace-cost-workflow";
import { resolveDateRangePreset } from "@/lib/workspace-date-presets";
import { roleHasCrmPermission } from "@/lib/crm-permissions";

describe("Master Data — exact product seed (docs prompt §5.1)", () => {
  it("berisi tepat 26 produk", () => {
    expect(WORKSPACE_PRODUCT_SEED).toHaveLength(26);
  });

  it("Product ID unik, PRO-0001..PRO-0024 + KSB-0001..KSB-0002 (Yacona/Teacona)", () => {
    const ids = WORKSPACE_PRODUCT_SEED.map((p) => p.productId);
    expect(new Set(ids).size).toBe(26);
    expect(ids[0]).toBe("PRO-0001");
    expect(ids[25]).toBe("PRO-0024");
    expect(ids.filter((id) => id.startsWith("KSB-"))).toEqual(["KSB-0001", "KSB-0002"]);
  });

  it("PRO-0002 Amandia Muesli sesuai spesifikasi persis", () => {
    const product = WORKSPACE_PRODUCT_SEED.find((p) => p.productId === "PRO-0002")!;
    expect(product).toMatchObject({ productName: "Amandia Muesli", sellingPrice: 54000, unitHpp: 32000, productUsage: "SELLABLE_AND_BONUS" });
  });

  it("PRO-0023 Pro Herbal Dummy adalah BONUS_ONLY, harga jual null (§5.2)", () => {
    const product = WORKSPACE_PRODUCT_SEED.find((p) => p.productId === "PRO-0023")!;
    expect(product).toMatchObject({ productName: "Pro Herbal Dummy", sellingPrice: null, unitHpp: 14000, productUsage: "BONUS_ONLY" });
  });

  it("semua produk selain PRO-0023 adalah SELLABLE_AND_BONUS dengan harga jual terisi (produk apa pun boleh jadi bonus/sampel)", () => {
    for (const product of WORKSPACE_PRODUCT_SEED) {
      if (product.productId === "PRO-0023") continue;
      expect(product.productUsage).toBe("SELLABLE_AND_BONUS");
      expect(product.sellingPrice).not.toBeNull();
    }
  });
});

describe("Product usage gating (docs prompt §5/§6.3.3)", () => {
  it("PRO-0023 (BONUS_ONLY) tidak pernah bisa dipilih sebagai SALE", () => {
    expect(allowedItemTypesForUsage("BONUS_ONLY")).not.toContain("SALE");
    expect(allowedItemTypesForUsage("BONUS_ONLY")).toEqual(["BONUS", "SAMPLE"]);
  });

  it("SELLABLE murni tidak bisa dipilih sebagai BONUS/SAMPLE", () => {
    expect(allowedItemTypesForUsage("SELLABLE")).toEqual(["SALE"]);
  });

  it("SELLABLE_AND_BONUS bisa SALE, BONUS, dan SAMPLE", () => {
    expect(allowedItemTypesForUsage("SELLABLE_AND_BONUS")).toEqual(["SALE", "BONUS", "SAMPLE"]);
  });

  it("INACTIVE tidak bisa dipilih sebagai apapun", () => {
    expect(allowedItemTypesForUsage("INACTIVE")).toEqual([]);
  });
});

describe("calculateWorkspaceOrder — rumus KPI Pesanan (docs prompt §4)", () => {
  const base = { shippingCharge: 0n, packingCharge: 0n, discount: 0n, codAdmin: 0n, crmVoucher: 0n, paymentMethod: "TRANSFER" as const };

  it("SALE menambah Total Sales, HPP-nya masuk COS", () => {
    const result = calculateWorkspaceOrder({
      ...base,
      items: [{ itemType: "SALE", quantity: 2n, sellingPrice: 54000n, unitHpp: 32000n }],
    });
    expect(result.totalSalesValue).toBe(108000n);
    expect(result.cosSale).toBe(64000n);
    expect(result.cosBonus).toBe(0n);
  });

  it("BONUS tidak menambah Total Sales tapi HPP-nya masuk COS (contoh Amandia+Pro Herbal Dummy §4.3)", () => {
    const result = calculateWorkspaceOrder({
      ...base,
      items: [
        { itemType: "SALE", quantity: 2n, sellingPrice: 54000n, unitHpp: 32000n },
        { itemType: "BONUS", quantity: 1n, sellingPrice: 0n, unitHpp: 14000n },
      ],
    });
    expect(result.totalSalesValue).toBe(108000n); // hanya dari SALE
    expect(result.cosSale).toBe(64000n);
    expect(result.cosBonus).toBe(14000n);
    expect(result.totalCos).toBe(78000n); // contoh persis dari prompt: Rp78.000
  });

  it("SAMPLE dalam pesanan juga masuk COS, bukan Total Sales", () => {
    const result = calculateWorkspaceOrder({ ...base, items: [{ itemType: "SAMPLE", quantity: 1n, sellingPrice: 0n, unitHpp: 5000n }] });
    expect(result.totalSalesValue).toBe(0n);
    expect(result.cosBonus).toBe(5000n);
  });

  it("tidak ada field COM di hasil kalkulasi order/item — COM murni dari Biaya Operasional (§4.4)", () => {
    const result = calculateWorkspaceOrder({ ...base, items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 1000n, unitHpp: 500n }] });
    expect(result).not.toHaveProperty("com");
    expect(result.items[0]).not.toHaveProperty("com");
  });

  it("Admin COD otomatis Rp0 untuk pembayaran TRANSFER walau input tidak nol", () => {
    const result = calculateWorkspaceOrder({ ...base, codAdmin: 5000n, paymentMethod: "TRANSFER", items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 10000n, unitHpp: 5000n }] });
    expect(result.effectiveCodAdmin).toBe(0n);
    expect(result.codValue).toBe(0n);
  });

  it("Admin COD dipakai apa adanya untuk pembayaran COD, dan codValue = orderTotal", () => {
    const result = calculateWorkspaceOrder({ ...base, codAdmin: 5000n, paymentMethod: "COD", items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 10000n, unitHpp: 5000n }] });
    expect(result.effectiveCodAdmin).toBe(5000n);
    expect(result.orderTotal).toBe(15000n);
    expect(result.codValue).toBe(15000n);
  });

  it("TOTAL tidak boleh negatif — melempar NegativeOrderTotalError", () => {
    expect(() =>
      calculateWorkspaceOrder({ ...base, discount: 100000n, items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 1000n, unitHpp: 500n }] })
    ).toThrow(NegativeOrderTotalError);
  });

  it("contoh lengkap TOTAL dan Pendapatan Bersih dari prompt §4.6", () => {
    const result = calculateWorkspaceOrder({
      shippingCharge: 20000n,
      packingCharge: 5000n,
      discount: 10000n,
      crmVoucher: 5000n,
      codAdmin: 3000n,
      paymentMethod: "COD",
      items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 200000n, unitHpp: 78000n }],
    });
    expect(result.orderTotal).toBe(213000n);
  });

  it("semua nilai uang berbentuk bigint, bukan number/float (ATURAN MUTLAK #7)", () => {
    const result = calculateWorkspaceOrder({ ...base, items: [{ itemType: "SALE", quantity: 1n, sellingPrice: 1000n, unitHpp: 500n }] });
    expect(typeof result.orderTotal).toBe("bigint");
    expect(typeof result.totalCos).toBe("bigint");
    expect(typeof result.items[0]!.totalSalesValue).toBe("bigint");
  });
});

describe("calculatePendapatanBersih (§4.6)", () => {
  it("Nilai Transaksi - COS - COM", () => {
    expect(calculatePendapatanBersih(213000n, 78000n, 15000n)).toBe(120000n);
  });
});

describe("calculateAov — AOV = Total Sales / Jumlah Pesanan (fitur KPI AOV)", () => {
  it("membagi Total Sales dengan Jumlah Pesanan CONFIRMED", () => {
    expect(calculateAov(1000000n, 4)).toBe(250000n);
  });

  it("truncate ke bawah (BigInt division), bukan dibulatkan", () => {
    expect(calculateAov(100000n, 3)).toBe(33333n);
  });

  it("0 pesanan -> AOV 0, bukan melempar error pembagian nol", () => {
    expect(calculateAov(0n, 0)).toBe(0n);
    expect(calculateAov(500000n, 0)).toBe(0n);
  });
});

describe("Filter tab Pesanan — Draft/Semua/Retur & Refund (fitur No Order + 3 tab)", () => {
  it("default tab adalah 'semua' bila tidak diisi", () => {
    expect(workspaceOrderFilterSchema.parse({}).tab).toBe("semua");
  });

  it("menerima tab 'draft' secara eksplisit", () => {
    expect(workspaceOrderFilterSchema.parse({ tab: "draft" }).tab).toBe("draft");
  });

  it("menerima tab 'retur_refund' secara eksplisit", () => {
    expect(workspaceOrderFilterSchema.parse({ tab: "retur_refund" }).tab).toBe("retur_refund");
  });

  it("menolak nilai tab yang tidak dikenal", () => {
    expect(workspaceOrderFilterSchema.safeParse({ tab: "lainnya" }).success).toBe(false);
  });

  it("tepat 3 tab: draft, semua, retur_refund", () => {
    expect(WORKSPACE_PESANAN_TABS).toEqual(["draft", "semua", "retur_refund"]);
  });
});

describe("MOVE_TARGETS_BY_TAB / MOVE_LABEL_BY_TAB — target bulk 'Pindahkan' per tab (fitur No Order)", () => {
  it("tab draft -> Confirmed atau Cancel (butuh No Order dulu untuk Confirmed)", () => {
    expect(MOVE_TARGETS_BY_TAB.draft).toEqual(["CONFIRMED", "CANCELLED"]);
  });

  it("tab semua -> Cancel/Retur/Refund", () => {
    expect(MOVE_TARGETS_BY_TAB.semua).toEqual(["CANCELLED", "RETURNED", "REFUNDED"]);
  });

  it("tab retur_refund -> Confirmed saja (satu-satunya jalan balik ke Pesanan)", () => {
    expect(MOVE_TARGETS_BY_TAB.retur_refund).toEqual(["CONFIRMED"]);
  });

  it("setiap tab punya label 'Pindahkan' sendiri", () => {
    for (const tab of WORKSPACE_PESANAN_TABS) {
      expect(typeof MOVE_LABEL_BY_TAB[tab]).toBe("string");
      expect(MOVE_LABEL_BY_TAB[tab].length).toBeGreaterThan(0);
    }
  });
});

describe("Body Pesanan — sourceOrderId (No Order/ID Pesanan Everpro) opsional (fitur tracking Everpro)", () => {
  const base = {
    orderDate: "2026-08-06",
    customerName: "Ibu Contoh",
    phone: "081234567890",
    paymentMethod: "TRANSFER" as const,
    crmUserId: 1,
    items: [{ productInternalId: 1, itemType: "SALE" as const, quantity: 1 }],
  };

  it("boleh dikosongkan (pesanan tetap bisa disimpan sebagai DRAFT)", () => {
    expect(workspaceOrderBodySchema.safeParse(base).success).toBe(true);
  });

  it("menerima sourceOrderId terisi", () => {
    const result = workspaceOrderBodySchema.safeParse({ ...base, sourceOrderId: "EP-000123" });
    expect(result.success).toBe(true);
  });
});

describe("Body Tandai Refund — refundAmount wajib > 0 (fitur Retur & Refund)", () => {
  it("menerima refundAmount positif", () => {
    const result = workspaceOrderRefundBodySchema.safeParse({ refundAmount: 50000, reason: "Barang rusak" });
    expect(result.success).toBe(true);
  });

  it("menolak refundAmount 0 atau negatif", () => {
    expect(workspaceOrderRefundBodySchema.safeParse({ refundAmount: 0 }).success).toBe(false);
    expect(workspaceOrderRefundBodySchema.safeParse({ refundAmount: -1000 }).success).toBe(false);
  });
});

describe("Body Hapus Pesanan — reason opsional (fitur checkbox/klik-kanan)", () => {
  it("menerima tanpa reason sama sekali", () => {
    expect(workspaceOrderDeleteBodySchema.safeParse({}).success).toBe(true);
  });

  it("menerima dengan reason", () => {
    expect(workspaceOrderDeleteBodySchema.safeParse({ reason: "Salah input" }).success).toBe(true);
  });
});

describe("Body Ubah Status massal — ids + target wajib (fitur checkbox/klik-kanan, dua arah)", () => {
  it("menerima array ids tidak kosong + target valid", () => {
    const result = workspaceOrderBulkStatusChangeBodySchema.safeParse({ ids: [1, 2, 3], target: "RETURNED" });
    expect(result.success).toBe(true);
  });

  it("menerima target CONFIRMED (arah Pindahkan ke Pesanan)", () => {
    expect(workspaceOrderBulkStatusChangeBodySchema.safeParse({ ids: [1], target: "CONFIRMED" }).success).toBe(true);
  });

  it("menolak array ids kosong", () => {
    expect(workspaceOrderBulkStatusChangeBodySchema.safeParse({ ids: [], target: "RETURNED" }).success).toBe(false);
  });

  it("menolak tanpa field ids sama sekali", () => {
    expect(workspaceOrderBulkStatusChangeBodySchema.safeParse({ target: "RETURNED", reason: "Retur massal" }).success).toBe(false);
  });

  it("menolak target yang tidak dikenal (mis. DRAFT)", () => {
    expect(workspaceOrderBulkStatusChangeBodySchema.safeParse({ ids: [1], target: "DRAFT" }).success).toBe(false);
  });
});

describe("availableStatusTargets — transisi status dua arah (fitur Retur & Refund)", () => {
  it("DRAFT hanya bisa ke CONFIRMED atau CANCELLED (belum pernah berhasil)", () => {
    expect(availableStatusTargets("DRAFT")).toEqual(["CONFIRMED", "CANCELLED"]);
  });

  it("CONFIRMED bisa ke CANCELLED/RETURNED/REFUNDED", () => {
    expect(availableStatusTargets("CONFIRMED")).toEqual(["CANCELLED", "RETURNED", "REFUNDED"]);
  });

  it("CANCELLED bisa balik ke CONFIRMED (customer pesan lagi) atau ke RETURNED/REFUNDED", () => {
    expect(availableStatusTargets("CANCELLED")).toEqual(["CONFIRMED", "RETURNED", "REFUNDED"]);
  });

  it("RETURNED/REFUNDED/PARTIALLY_REFUNDED bisa balik ke CONFIRMED", () => {
    expect(availableStatusTargets("RETURNED")).toContain("CONFIRMED");
    expect(availableStatusTargets("REFUNDED")).toContain("CONFIRMED");
    expect(availableStatusTargets("PARTIALLY_REFUNDED")).toContain("CONFIRMED");
  });

  it("tidak pernah menawarkan status saat ini sebagai tujuan", () => {
    for (const status of ["CONFIRMED", "CANCELLED", "RETURNED", "REFUNDED", "PARTIALLY_REFUNDED"] as const) {
      expect(availableStatusTargets(status)).not.toContain(status);
    }
  });
});

describe("Zod contract — Admin COD wajib nol saat Transfer", () => {
  it("menolak Admin COD > 0 dengan paymentMethod TRANSFER", () => {
    const result = workspaceOrderBodySchema.safeParse({
      orderDate: "2026-08-05",
      customerName: "A",
      phone: "081234567890",
      paymentMethod: "TRANSFER",
      crmUserId: 1,
      items: [{ productInternalId: 1, itemType: "SALE", quantity: 1 }],
      codAdmin: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("menerima Admin COD > 0 dengan paymentMethod COD", () => {
    const result = workspaceOrderBodySchema.safeParse({
      orderDate: "2026-08-05",
      customerName: "A",
      phone: "081234567890",
      paymentMethod: "COD",
      crmUserId: 1,
      items: [{ productInternalId: 1, itemType: "SALE", quantity: 1 }],
      codAdmin: 5000,
    });
    expect(result.success).toBe(true);
  });
});

describe("Biaya Operasional — approval chain (docs prompt §9.4)", () => {
  it("hanya Leader/SPV/Direktur boleh membuat pengajuan", () => {
    expect(canCreateCost("LEADER")).toBe(true);
    expect(canCreateCost("SPV")).toBe(true);
    expect(canCreateCost("DIRECTOR")).toBe(true);
    expect(canCreateCost("OTHER")).toBe(false);
  });

  it("resolveCostRole mencocokkan nama tanpa memandang kapitalisasi", () => {
    expect(resolveCostRole("feny nuraini")).toBe("LEADER");
    expect(resolveCostRole("NI'MAH LUTHFIANINGSIH")).toBe("SPV");
    expect(resolveCostRole("Rahman Arief Dewantara")).toBe("DIRECTOR");
    expect(resolveCostRole("Anggota CRM Biasa")).toBe("OTHER");
  });

  it("Leader membuat -> lewati Leader Verify, langsung butuh SPV Approve, lalu Director Approve", () => {
    expect(nextApprovalStage("SUBMITTED", "LEADER")).toBe("SPV_APPROVE");
    expect(nextApprovalStage("SPV_APPROVED", "LEADER")).toBe("DIRECTOR_APPROVE");
  });

  it("SPV membuat -> Leader Verify dulu, lalu lewati SPV Approve, langsung Director Approve", () => {
    expect(nextApprovalStage("SUBMITTED", "SPV")).toBe("LEADER_VERIFY");
    expect(nextApprovalStage("LEADER_VERIFIED", "SPV")).toBe("DIRECTOR_APPROVE");
  });

  it("pembuat lain (mis. Director/ADMIN) -> rantai penuh Leader -> SPV -> Director", () => {
    expect(nextApprovalStage("SUBMITTED", "DIRECTOR")).toBe("LEADER_VERIFY");
    expect(nextApprovalStage("LEADER_VERIFIED", "DIRECTOR")).toBe("SPV_APPROVE");
    expect(nextApprovalStage("SPV_APPROVED", "DIRECTOR")).toBe("DIRECTOR_APPROVE");
  });

  it("DRAFT/REVISION_REQUESTED tidak punya tahap approval berikutnya (harus submit dulu)", () => {
    expect(nextApprovalStage("DRAFT", "OTHER")).toBeNull();
    expect(nextApprovalStage("REVISION_REQUESTED", "OTHER")).toBeNull();
  });

  it("tahap final selalu DIRECTOR_APPROVE -> status DIRECTOR_APPROVED", () => {
    expect(requiredApproverRole("DIRECTOR_APPROVE")).toBe("DIRECTOR");
    expect(stageResultStatus("DIRECTOR_APPROVE")).toBe("DIRECTOR_APPROVED");
  });

  it("hanya DIRECTOR_APPROVED yang eligible masuk COM (§4.4/§9.5)", () => {
    expect(COM_ELIGIBLE_STATUS).toBe("DIRECTOR_APPROVED");
    expect(COM_ELIGIBLE_STATUS).not.toBe("SUBMITTED");
    expect(COM_ELIGIBLE_STATUS).not.toBe("SPV_APPROVED");
  });
});

describe("Permission gating — Workspace CRM V1 (docs prompt §11)", () => {
  it("ADMIN punya seluruh permission Workspace baru", () => {
    expect(roleHasCrmPermission("ADMIN", "crm.order.create")).toBe(true);
    expect(roleHasCrmPermission("ADMIN", "crm.product.create")).toBe(true);
    expect(roleHasCrmPermission("ADMIN", "crm.com.director_approve")).toBe(true);
  });

  it("CRM boleh baca dan mengelola Pesanan/Biaya Operasional, tapi tidak mengubah Master Data", () => {
    expect(roleHasCrmPermission("CRM", "crm.order.read")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.order.create")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.com.submit")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.product.create")).toBe(false);
    expect(roleHasCrmPermission("CRM", "crm.product.update")).toBe(false);
    expect(roleHasCrmPermission("CRM", "crm.product.deactivate")).toBe(false);
  });

  it("CRM boleh menandai pesanan retur/refund (fitur Retur & Refund)", () => {
    expect(roleHasCrmPermission("CRM", "crm.order.return")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.order.refund")).toBe(true);
  });

  it("CRM boleh menghapus pesanan (fitur checkbox/klik-kanan Edit Data)", () => {
    expect(roleHasCrmPermission("CRM", "crm.order.delete")).toBe(true);
  });

  it("MANAGEMENT tidak pernah mendapat permission Workspace CRM V1 apa pun", () => {
    expect(roleHasCrmPermission("MANAGEMENT", "crm.order.read")).toBe(false);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.workspace.overview.read")).toBe(false);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.com.read")).toBe(false);
  });
});

describe("Date range presets (docs prompt §6.1)", () => {
  const reference = new Date("2026-08-05T12:00:00+07:00"); // Rabu, 5 Agustus 2026 WIB

  it("TODAY = tanggal hari ini di Asia/Jakarta", () => {
    expect(resolveDateRangePreset("TODAY", reference)).toEqual({ from: "2026-08-05", to: "2026-08-05" });
  });

  it("YESTERDAY = H-1", () => {
    expect(resolveDateRangePreset("YESTERDAY", reference)).toEqual({ from: "2026-08-04", to: "2026-08-04" });
  });

  it("THIS_MONTH dimulai tanggal 1 bulan berjalan", () => {
    expect(resolveDateRangePreset("THIS_MONTH", reference)).toEqual({ from: "2026-08-01", to: "2026-08-05" });
  });

  it("LAST_MONTH adalah bulan kalender sebelumnya secara penuh", () => {
    expect(resolveDateRangePreset("LAST_MONTH", reference)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("ALL_TIME tidak membatasi tanggal (Seluruh Data = seluruh data sejak fresh start, bukan legacy)", () => {
    expect(resolveDateRangePreset("ALL_TIME", reference)).toEqual({ from: null, to: null });
  });
});
