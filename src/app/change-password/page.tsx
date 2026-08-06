import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireSession } from "@/server/auth/guards";

export const metadata = { title: "Ganti Password · PROBETES Customer Intelligence" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await requireSession();
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <ChangePasswordForm forced={user.mustChangePassword} />
    </main>
  );
}
