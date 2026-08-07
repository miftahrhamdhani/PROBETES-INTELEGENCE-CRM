"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Kolom wajib (No HP, Nama, Cluster, Status Grup, Aksi) TIDAK ada di sini —
 *  hanya kolom yang boleh disembunyikan user lewat "Tampilan Kolom". */
export const OPTIONAL_CUSTOMER_COLUMNS: { id: string; label: string }[] = [
  { id: "recency", label: "R (Recency)" },
  { id: "frequency", label: "F (Frequency)" },
  { id: "monetary", label: "M (Monetary)" },
  { id: "firstOrderDivision", label: "Sumber" },
  { id: "groupName", label: "Nama Grup" },
  { id: "pic", label: "PIC" },
  { id: "lastOrder", label: "Last Order" },
  { id: "cs", label: "CS" },
];

export function ColumnVisibilityDropdown({
  hidden,
  onToggle,
}: {
  hidden: readonly string[];
  onToggle: (columnId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3 className="h-3.5 w-3.5" /> Tampilan Kolom
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONAL_CUSTOMER_COLUMNS.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={!hidden.includes(col.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(col.id)}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
