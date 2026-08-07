"use client";

import * as React from "react";
import type { VisibilityState } from "@tanstack/react-table";

/**
 * "Tampilan Kolom" — persist HANYA daftar id kolom yang disembunyikan (bukan
 * data customer apa pun) ke localStorage, per context (customers/group/cluster).
 * Kolom wajib (No HP, Nama, Cluster, Status Grup, Aksi) sengaja tidak pernah
 * ada di `optionalColumnIds` pemanggil, jadi tidak mungkin ikut disembunyikan.
 */
export function storageKeyForContext(context: string): string {
  return `customer-table-hidden-columns:${context}`;
}

/** Pure — dites tanpa render (lihat tests/data-table.test.ts untuk pola serupa).
 *  Membuang id yang bukan bagian dari `validIds` supaya localStorage basi dari
 *  versi kolom lama tidak menyembunyikan kolom yang sudah tidak ada/berganti nama. */
export function parseStoredHiddenColumns(raw: string | null, validIds: readonly string[]): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid = new Set(validIds);
  return parsed.filter((id): id is string => typeof id === "string" && valid.has(id));
}

export function serializeHiddenColumns(hidden: readonly string[]): string {
  return JSON.stringify(hidden);
}

function toVisibilityState(hidden: readonly string[]): VisibilityState {
  const state: VisibilityState = {};
  for (const id of hidden) state[id] = false;
  return state;
}

export function useColumnVisibility(context: string, optionalColumnIds: readonly string[]) {
  const storageKey = storageKeyForContext(context);
  const [hidden, setHidden] = React.useState<string[]>([]);

  React.useEffect(() => {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
    setHidden(parseStoredHiddenColumns(raw, optionalColumnIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggleColumn = React.useCallback(
    (columnId: string) => {
      setHidden((prev) => {
        const next = prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId];
        window.localStorage.setItem(storageKey, serializeHiddenColumns(next));
        return next;
      });
    },
    [storageKey]
  );

  const visibility = React.useMemo(() => toVisibilityState(hidden), [hidden]);

  return { hidden, visibility, toggleColumn };
}
