"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BulkTarget } from "./bulk-group-dialog";

/** Konfirmasi generik untuk aksi massal yang tidak butuh form (Nonaktifkan,
 *  Hapus dari Grup) — satu komponen dipakai dua kali di CustomerBulkToolbar. */
export function BulkConfirmDialog({
  customers,
  title,
  description,
  actionLabel,
  onConfirm,
  onOpenChange,
}: {
  customers: BulkTarget[] | null;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: (customers: BulkTarget[]) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [saving, setSaving] = React.useState(false);

  async function handleConfirm() {
    if (!customers?.length) return;
    setSaving(true);
    try {
      await onConfirm(customers);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={!!customers} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {customers?.length ?? 0} customer dipilih — {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
