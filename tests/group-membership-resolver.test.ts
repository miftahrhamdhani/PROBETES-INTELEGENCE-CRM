import { describe, expect, it } from "vitest";
import { resolveMembershipBackfill } from "@/server/import/group-membership-resolver";
import type { GroupListEntry } from "@/server/import/types";

function entry(phone: string, sourceList: string): GroupListEntry {
  return { normalizedPhone: phone, name: "Test", sourceList, sourceRowNumber: 2 };
}

describe("resolveMembershipBackfill", () => {
  it("phone hanya di masukWA -> GROUPED, source LEGACY_MASUK_WA", () => {
    const result = resolveMembershipBackfill([entry("6281111111111", "masukWA")], [], []);
    expect(result).toEqual([
      { normalizedPhone: "6281111111111", status: "GROUPED", source: "LEGACY_MASUK_WA", conflict: false },
    ]);
  });

  it("phone hanya di BackupMasukGrup -> GROUPED, source LEGACY_BACKUP_MASUK_GRUP", () => {
    const result = resolveMembershipBackfill([], [entry("6282222222222", "BackupMasukGrup")], []);
    expect(result).toEqual([
      {
        normalizedPhone: "6282222222222",
        status: "GROUPED",
        source: "LEGACY_BACKUP_MASUK_GRUP",
        conflict: false,
      },
    ]);
  });

  it("phone di masukWA DAN BackupMasukGrup -> GROUPED, source LEGACY_MASUK_WA (prioritas label)", () => {
    const result = resolveMembershipBackfill(
      [entry("6283333333333", "masukWA")],
      [entry("6283333333333", "BackupMasukGrup")],
      []
    );
    expect(result).toEqual([
      { normalizedPhone: "6283333333333", status: "GROUPED", source: "LEGACY_MASUK_WA", conflict: false },
    ]);
  });

  it("phone hanya di tidakmasukWA -> NOT_GROUPED", () => {
    const result = resolveMembershipBackfill([], [], [entry("6284444444444", "tidakmasukWA")]);
    expect(result).toEqual([
      {
        normalizedPhone: "6284444444444",
        status: "NOT_GROUPED",
        source: "LEGACY_TIDAK_MASUK_WA",
        conflict: false,
      },
    ]);
  });

  it("phone di masukWA DAN tidakmasukWA sekaligus -> UNKNOWN + conflict, TIDAK auto-resolve", () => {
    const result = resolveMembershipBackfill(
      [entry("6285555555555", "masukWA")],
      [],
      [entry("6285555555555", "tidakmasukWA")]
    );
    expect(result).toEqual([
      { normalizedPhone: "6285555555555", status: "UNKNOWN", source: "LEGACY_MASUK_WA", conflict: true },
    ]);
  });

  it("phone di BackupMasukGrup DAN tidakmasukWA sekaligus -> UNKNOWN + conflict", () => {
    const result = resolveMembershipBackfill(
      [],
      [entry("6286666666666", "BackupMasukGrup")],
      [entry("6286666666666", "tidakmasukWA")]
    );
    expect(result).toEqual([
      {
        normalizedPhone: "6286666666666",
        status: "UNKNOWN",
        source: "LEGACY_BACKUP_MASUK_GRUP",
        conflict: true,
      },
    ]);
  });

  it("phone tidak ada di source manapun -> tidak muncul di hasil sama sekali", () => {
    const result = resolveMembershipBackfill(
      [entry("6281111111111", "masukWA")],
      [],
      []
    );
    expect(result.find((r) => r.normalizedPhone === "6289999999999")).toBeUndefined();
  });

  it("hasil terurut by normalizedPhone", () => {
    const result = resolveMembershipBackfill(
      [entry("6283000000000", "masukWA"), entry("6281000000000", "masukWA")],
      [],
      [entry("6282000000000", "tidakmasukWA")]
    );
    expect(result.map((r) => r.normalizedPhone)).toEqual([
      "6281000000000",
      "6282000000000",
      "6283000000000",
    ]);
  });
});
