"use client";

import { useActionState } from "react";
import { CircleGauge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/app/(auth)/login/actions";

export function LoginForm({ next }: { next: string }) {
  // `action` (bukan onSubmit) supaya form tetap POST ke server action walau JS
  // belum ter-hydrate — kalau tidak, browser fallback ke GET dan kredensial
  // ikut ke URL query string.
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CircleGauge className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight">PROBETES</p>
          <p className="text-[11px] text-muted-foreground">Customer Intelligence</p>
        </div>
      </div>

      <h1 className="text-lg font-semibold tracking-tight">Masuk</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Akses internal. Akun dibuat oleh admin, tidak ada registrasi publik.
      </p>

      <form action={formAction} method="post" className="mt-5 space-y-3">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
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
          {pending ? "Memeriksa..." : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
