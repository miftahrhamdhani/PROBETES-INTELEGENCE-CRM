import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/next-path";
import { auth } from "@/server/auth";

export const metadata = { title: "Masuk · PROBETES Customer Intelligence" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; password?: string }>;
}) {
  const session = await auth();
  const { next, email, password } = await searchParams;
  const target = safeNextPath(next);

  // Kredensial tidak boleh nyangkut di URL (history browser, log, Referer).
  // Bisa terjadi kalau form disubmit sebagai GET saat JS belum ter-hydrate.
  if (email !== undefined || password !== undefined) {
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }
  if (session?.user?.role) redirect(target);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <LoginForm next={target} />
    </main>
  );
}
