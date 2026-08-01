/**
 * SHARED — normalisasi parameter `?next=` setelah login.
 * `//evil.com` juga lolos startsWith("/") dan jadi protocol-relative URL,
 * artinya open redirect ke domain lain. Backslash dipakai beberapa browser
 * sebagai pemisah host, jadi ikut ditolak.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
