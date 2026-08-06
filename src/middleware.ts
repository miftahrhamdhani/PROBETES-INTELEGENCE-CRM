import { NextResponse } from "next/server";
import { canAccessPath, LOGIN_PATH } from "@/lib/roles";
import { authEdge } from "@/server/auth/edge";

/**
 * Data berisi PII (nama, nomor HP, riwayat transaksi) — seluruh route diproteksi
 * kecuali /login dan /api/auth/*. Lihat docs/04-DESIGN.md §keamanan.
 */
const CHANGE_PASSWORD_PATH = "/change-password";

export default authEdge((request) => {
  const { pathname, origin, search } = request.nextUrl;
  const role = request.auth?.user?.role;

  if (!role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const url = new URL(LOGIN_PATH, origin);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Akun dengan password sementara (docs prompt perbaikan §7) dikunci ke
  // /change-password sampai user sendiri menggantinya — berlaku sebelum
  // pengecekan role supaya tidak bisa dilewati lewat halaman lain manapun.
  if (request.auth?.user?.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Password sementara wajib diganti terlebih dahulu" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, origin));
  }

  if (!canAccessPath(role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Role tidak punya akses" }, { status: 403 });
    }
    // Dashboard "/" boleh untuk semua role -> tidak ada risiko redirect loop.
    return NextResponse.redirect(new URL("/", origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
