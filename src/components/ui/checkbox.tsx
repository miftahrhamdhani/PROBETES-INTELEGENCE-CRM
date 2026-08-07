"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox bergaya shadcn di atas `<input type="checkbox">` NATIF — sengaja
 * tidak menambah dependency baru (@radix-ui/react-checkbox belum terpasang).
 *
 * Native input dipertahankan supaya perilaku bawaan tetap utuh: fokus keyboard,
 * `indeterminate` (state "sebagian tercentang" di header tabel), asosiasi
 * label/form, dan pembacaan screen reader — semuanya gratis tanpa ARIA manual.
 *
 * Ikon centang/strip digambar dengan komponen Lucide yang di-overlay dan
 * di-toggle lewat varian `peer-*`, BUKAN `background-image` data-URI di kelas
 * arbitrary Tailwind: data-URI panjang (berisi kutip, slash, dan persen)
 * tidak selalu terdeteksi pemindai kelas Tailwind, sehingga CSS-nya tidak
 * pernah ter-generate dan kotaknya cuma tampil biru polos tanpa centang.
 */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
    indeterminate?: boolean;
    className?: string;
  }
>(({ className, indeterminate = false, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  // `indeterminate` hanya ada sebagai properti DOM (tidak ada atribut HTML-nya),
  // jadi wajib diset lewat ref setiap kali nilainya berubah.
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <span className={cn("relative inline-flex h-4 w-4 shrink-0 align-middle", className)}>
      <input
        ref={innerRef}
        type="checkbox"
        className={cn(
          "peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-slate-300 bg-white",
          "transition-colors hover:border-primary/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "checked:border-primary checked:bg-primary",
          "indeterminate:border-primary indeterminate:bg-primary",
          "dark:border-slate-600 dark:bg-transparent"
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3.5}
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100 peer-[:indeterminate]:opacity-0"
      />
      <Minus
        aria-hidden="true"
        strokeWidth={3.5}
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-primary-foreground opacity-0 peer-[:indeterminate]:opacity-100"
      />
    </span>
  );
});
Checkbox.displayName = "Checkbox";
