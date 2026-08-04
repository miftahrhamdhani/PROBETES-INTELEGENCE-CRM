"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import {
  createUserAction,
  loadUserHistory,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/app/users-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLES } from "@/lib/roles";
import {
  MIN_PASSWORD_LENGTH,
  USER_ACTION_LABELS,
  type UserAdminRow,
  type UserHistoryEntry,
} from "@/lib/user-admin-contracts";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: UserAdminRow }
  | { kind: "password"; user: UserAdminRow }
  | { kind: "history"; user: UserAdminRow }
  | null;

export function UserManager({ initialUsers, currentUserId }: { initialUsers: UserAdminRow[]; currentUserId: number }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activeAdmins = initialUsers.filter((u) => u.role === "ADMIN" && u.active).length;

  async function toggleActive(user: UserAdminRow) {
    setBusyId(user.id);
    setError(null);
    try {
      await setUserActiveAction(user.id, { active: !user.active });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Pengguna aplikasi</CardTitle>
            <CardDescription>
              Tidak ada registrasi publik — akun hanya dibuat di sini. Password disimpan ter-hash dan tidak pernah ditampilkan.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
            <Plus className="h-3.5 w-3.5" /> Tambah user
          </Button>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-thin overflow-x-auto rounded-lg border">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/70">
                  <Th>Nama</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th>
                  <Th>Dibuat oleh</Th><Th>Diubah oleh</Th><Th />
                </tr>
              </thead>
              <tbody>
                {initialUsers.map((user) => {
                  const isLastActiveAdmin = user.role === "ADMIN" && user.active && activeAdmins <= 1;
                  return (
                    <tr key={user.id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {user.name}
                        {user.id === currentUserId ? <span className="ml-1 text-muted-foreground">(Anda)</span> : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{user.role}</Badge></td>
                      <td className="px-3 py-2">
                        {user.active ? <Badge variant="success">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{user.createdBy ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{user.updatedBy ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "edit", user })}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "password", user })}>
                            <KeyRound className="h-3.5 w-3.5" /> Password
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "history", user })}>
                            Riwayat
                          </Button>
                          <Button
                            size="sm"
                            variant={user.active ? "outline" : "default"}
                            disabled={busyId === user.id || isLastActiveAdmin}
                            title={isLastActiveAdmin ? "Satu-satunya ADMIN aktif — tidak bisa dinonaktifkan" : undefined}
                            onClick={() => toggleActive(user)}
                          >
                            {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {user.active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            ADMIN aktif saat ini: {activeAdmins}. Aplikasi menolak menonaktifkan atau menurunkan role ADMIN aktif terakhir.
          </p>
        </CardContent>
      </Card>

      {dialog?.kind === "create" ? <CreateDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} /> : null}
      {dialog?.kind === "edit" ? <EditDialog user={dialog.user} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} /> : null}
      {dialog?.kind === "password" ? <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} /> : null}
      {dialog?.kind === "history" ? <HistoryDialog user={dialog.user} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function useSubmit(run: () => Promise<void>, onDone: () => void) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await run();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
      setSaving(false);
    }
  }
  return { saving, error, submit };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message}
    </p>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      id="role"
      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
    </select>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<string>("CRM");
  const [password, setPassword] = React.useState("");
  const { saving, error, submit } = useSubmit(
    () => createUserAction({ email, name, role, password }).then(() => undefined),
    onDone
  );

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Tambah user</DialogTitle>
            <DialogDescription>Password akan langsung di-hash dan tidak dapat dilihat kembali.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></div>
            <div><Label htmlFor="name">Nama</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div><Label htmlFor="role">Role</Label><RoleSelect value={role} onChange={setRole} /></div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              <p className="mt-1 text-[11px] text-muted-foreground">Minimal {MIN_PASSWORD_LENGTH} karakter.</p>
            </div>
            <ErrorNote message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ user, onClose, onDone }: { user: UserAdminRow; onClose: () => void; onDone: () => void }) {
  const [name, setName] = React.useState(user.name);
  const [role, setRole] = React.useState<string>(user.role);
  const { saving, error, submit } = useSubmit(() => updateUserAction(user.id, { name, role }), onDone);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit {user.email}</DialogTitle>
            <DialogDescription>Email tidak dapat diubah — dipakai sebagai identitas login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label htmlFor="name">Nama</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div><Label htmlFor="role">Role</Label><RoleSelect value={role} onChange={setRole} /></div>
            <ErrorNote message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onDone }: { user: UserAdminRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const mismatch = confirm.length > 0 && password !== confirm;
  const { saving, error, submit } = useSubmit(() => resetUserPasswordAction(user.id, { password }), onDone);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Password lama tidak dapat dibaca (tersimpan sebagai hash). Setelah reset, sampaikan password baru lewat kanal aman.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <p className="rounded-md border bg-muted/40 p-2 text-xs">{user.name} · {user.email}</p>
            <div>
              <Label htmlFor="new-password">Password baru</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </div>
            <div>
              <Label htmlFor="confirm-password">Ulangi password</Label>
              <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
              {mismatch ? <p className="mt-1 text-[11px] text-destructive">Password tidak sama.</p> : null}
            </div>
            <ErrorNote message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving || mismatch || password.length < MIN_PASSWORD_LENGTH}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ user, onClose }: { user: UserAdminRow; onClose: () => void }) {
  const [entries, setEntries] = React.useState<UserHistoryEntry[] | null>(null);
  React.useEffect(() => {
    loadUserHistory(user.id).then(setEntries).catch(() => setEntries([]));
  }, [user.id]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Riwayat akun</DialogTitle>
          <DialogDescription>{user.name} · {user.email}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-auto py-2">
          {entries === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat…</p>
          ) : entries.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada perubahan tercatat.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{USER_ACTION_LABELS[entry.action] ?? entry.action}</span>
                  <span className="tabular text-muted-foreground">{entry.changedAt.slice(0, 19).replace("T", " ")}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  oleh {entry.changedBy ?? "sistem"}
                  {entry.detail.from !== undefined ? ` · ${String(entry.detail.from)} → ${String(entry.detail.to)}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="border-b px-3 py-2 text-left font-semibold">{children}</th>;
}
