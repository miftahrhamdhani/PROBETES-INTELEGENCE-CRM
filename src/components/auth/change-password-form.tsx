"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "@/app/change-password/actions";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);

  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-semibold tracking-tight">Ganti Password</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {forced
          ? "Akun Anda memakai password sementara — wajib diganti sebelum melanjutkan."
          : "Password baru akan berlaku setelah Anda masuk kembali."}
      </p>

      <form action={formAction} method="post" className="mt-5 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="currentPassword" className="text-xs font-medium">Password Lama</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="newPassword" className="text-xs font-medium">Password Baru</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-medium">Konfirmasi Password Baru</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {state?.error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Menyimpan..." : "Simpan Password Baru"}
        </Button>
      </form>
    </div>
  );
}
