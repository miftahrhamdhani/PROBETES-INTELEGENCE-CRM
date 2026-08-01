import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { auth } from "@/server/auth";
import "./globals.css";

const themeScript = `
  try {
    const saved = localStorage.getItem("theme");
    const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {}
`;

export const metadata: Metadata = {
  title: "PROBETES Customer Intelligence",
  description: "RFM, Cohort, Retention, Frequency, dan Customer Cluster PROBETES",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Session disuntik dari server agar sidebar tidak berkedip saat menunggu fetch.
  const session = await auth();

  return (
    <html lang="id" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <AuthSessionProvider session={session}>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
