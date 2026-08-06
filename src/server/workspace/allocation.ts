export type AllocationInput = {
  key: string;
  weight: bigint;
};

/** Integer-only largest remainder; stable key menyelesaikan remainder yang sama. */
export function allocateLargestRemainder(total: bigint, items: AllocationInput[]): Map<string, bigint> {
  if (total < 0n) throw new RangeError("Nilai alokasi tidak boleh negatif");
  if (!items.length) return new Map();
  if (items.some((item) => item.weight < 0n)) throw new RangeError("Bobot alokasi tidak boleh negatif");

  const weightTotal = items.reduce((sum, item) => sum + item.weight, 0n);
  if (weightTotal === 0n) {
    const sorted = [...items].sort((a, b) => a.key.localeCompare(b.key));
    const base = total / BigInt(sorted.length);
    let remainder = total % BigInt(sorted.length);
    return new Map(
      sorted.map((item) => {
        const value = base + (remainder-- > 0n ? 1n : 0n);
        return [item.key, value];
      })
    );
  }

  const rows = items.map((item) => {
    const numerator = total * item.weight;
    return {
      ...item,
      value: numerator / weightTotal,
      remainder: numerator % weightTotal,
    };
  });
  let pennies = total - rows.reduce((sum, row) => sum + row.value, 0n);
  rows.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  for (const row of rows) {
    if (pennies <= 0n) break;
    row.value += 1n;
    pennies -= 1n;
  }
  return new Map(rows.map((row) => [row.key, row.value]));
}

export type WorkspaceAllocationItem = {
  key: string;
  gross: bigint;
  quantity: bigint;
  unitHpp: bigint | null;
};

export type WorkspaceOrderAllocation = {
  discount: bigint;
  packing: bigint;
  adminCod: bigint;
  voucher: bigint;
  com: bigint;
};

export function allocateOrderComponents(items: WorkspaceAllocationItem[], values: WorkspaceOrderAllocation) {
  const weights = items.map((item) => ({ key: item.key, weight: item.gross }));
  const discount = allocateLargestRemainder(values.discount, weights);
  const packing = allocateLargestRemainder(values.packing, weights);
  const adminCod = allocateLargestRemainder(values.adminCod, weights);
  const voucher = allocateLargestRemainder(values.voucher, weights);
  const com = allocateLargestRemainder(values.com, weights);

  return items.map((item) => {
    const itemDiscount = discount.get(item.key) ?? 0n;
    const itemPacking = packing.get(item.key) ?? 0n;
    const itemAdminCod = adminCod.get(item.key) ?? 0n;
    const itemVoucher = voucher.get(item.key) ?? 0n;
    const itemCom = com.get(item.key) ?? 0n;
    const totalHpp = item.unitHpp === null ? null : item.unitHpp * item.quantity;
    return {
      key: item.key,
      allocatedDiscount: itemDiscount,
      allocatedPacking: itemPacking,
      allocatedAdminCod: itemAdminCod,
      allocatedVoucher: itemVoucher,
      allocatedCom: itemCom,
      netRevenue: item.gross + itemPacking + itemAdminCod - itemDiscount - itemVoucher,
      totalHpp,
      hppStatus: item.unitHpp === null ? ("UNKNOWN" as const) : ("KNOWN" as const),
    };
  });
}
