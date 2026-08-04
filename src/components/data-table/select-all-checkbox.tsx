"use client";

import * as React from "react";

/**
 * Checkbox header "centang semua" — dipakai kolom "select" di Customers,
 * Customer Cluster, dan Pembagian Tugas (satu komponen, bukan diketik ulang
 * 3×). Mencentang/menghapus centang HANYA baris yang sudah dimuat sejauh ini
 * (hasil infinite scroll saat ini) — bukan seluruh data yang cocok filter,
 * yang bisa ribuan baris dan belum semuanya sampai ke browser. Pola ini sama
 * dengan Gmail dkk: aman, tidak ada risiko bulk-action ke data yang belum
 * pernah terlihat.
 *
 * State indeterminate (sebagian tercentang) ditulis lewat ref karena atribut
 * itu tidak ada versi HTML attribute-nya, hanya properti DOM.
 */
export function SelectAllCheckbox({
  allSelected,
  someSelected,
  onToggle,
  ariaLabel,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 cursor-pointer accent-primary"
      checked={allSelected}
      onChange={onToggle}
      aria-label={ariaLabel}
    />
  );
}
