"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupImportDialog } from "@/components/customer/group-import-dialog";

/** Tombol "+ Import Data Grup". Setelah dialog ditutup, halaman di-refresh
 *  supaya KPI dan daftar member langsung mencerminkan hasil import. */
export function GroupImportButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        Import Data Grup
      </Button>
      <GroupImportDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) router.refresh();
        }}
      />
    </>
  );
}
