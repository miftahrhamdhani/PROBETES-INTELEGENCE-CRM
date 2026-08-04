import { AppShell } from "@/components/layout/app-shell";
import { UserManager } from "@/components/users/user-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadUsers } from "@/app/users-actions";
import { requireRole } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Users — ADMIN only. Tidak ada registrasi publik; akun hanya dibuat di sini
 * atau lewat `npm run db:seed:admin`. Password hanya disimpan sebagai hash dan
 * tidak pernah dikirim ke client.
 */
export default async function UsersPage() {
  let users, currentUserId;
  try {
    const actor = await requireRole("ADMIN");
    currentUserId = Number(actor.id);
    users = await loadUsers();
  } catch (error) {
    console.error("Users gagal dimuat", error);
    return (
      <AppShell title="Users">
        <Card>
          <CardHeader>
            <CardTitle>Halaman belum bisa dimuat</CardTitle>
            <CardDescription>Akses ditolak atau koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Users">
      <div className="space-y-4">
        <UserManager initialUsers={users} currentUserId={currentUserId} />

        <Card>
          <CardHeader><CardTitle>Catatan keamanan</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
            <p><strong className="text-foreground">Password tidak pernah ditampilkan.</strong> Disimpan sebagai hash scrypt bersalt; reset berarti mengganti, bukan membaca.</p>
            <p><strong className="text-foreground">Anti-lockout.</strong> ADMIN aktif terakhir tidak bisa dinonaktifkan atau diturunkan role — dicek di database, bukan hanya di tombol.</p>
            <p><strong className="text-foreground">Nonaktif berlaku segera.</strong> Sesi yang sudah terbit ikut ditolak pada permintaan berikutnya, tidak menunggu token kedaluwarsa.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
