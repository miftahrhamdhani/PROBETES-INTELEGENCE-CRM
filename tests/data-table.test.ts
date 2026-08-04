import { describe, expect, it } from "vitest";
import { rectanglesIntersect } from "../src/components/data-table/data-table";

describe("rectanglesIntersect", () => {
  const row = { left: 10, right: 100, top: 20, bottom: 60 };

  it("mendeteksi overlap dan sentuhan batas", () => {
    expect(rectanglesIntersect(row, { left: 50, right: 120, top: 30, bottom: 70 })).toBe(true);
    expect(rectanglesIntersect(row, { left: 100, right: 130, top: 60, bottom: 90 })).toBe(true);
  });

  it("menolak kotak yang tidak menyentuh baris", () => {
    expect(rectanglesIntersect(row, { left: 101, right: 130, top: 20, bottom: 60 })).toBe(false);
    expect(rectanglesIntersect(row, { left: 10, right: 100, top: 61, bottom: 90 })).toBe(false);
  });
});
