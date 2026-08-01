import { AppShell } from "@/components/layout/app-shell";
import { DatabaseAllImport } from "@/components/import/database-all-import";

export default function ImportPage() {
  return <AppShell title="Import Database"><DatabaseAllImport /></AppShell>;
}
