import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspacePicSummaryRow } from "@/lib/workspace-types";

export function WorkspacePicSummaryTable({ rows }: { rows: WorkspacePicSummaryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ringkasan per PIC CRM</CardTitle>
        <CardDescription>Jumlah task per status, per PIC yang sedang menangani minimal satu task.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            Belum ada task yang di-assign ke PIC manapun.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <Th align="left">PIC</Th>
                  <Th>Assigned</Th>
                  <Th>In Progress</Th>
                  <Th>Selesai</Th>
                  <Th>Overdue</Th>
                  <Th>Closing</Th>
                  <Th>Masuk Grup</Th>
                  <Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/workspace/pembagian-tugas?pic=${row.userId}`} className="text-primary hover:underline">
                        {row.userName}
                      </Link>
                    </td>
                    <Td>{row.assigned}</Td>
                    <Td>{row.inProgress}</Td>
                    <Td>{row.done}</Td>
                    <Td className={row.overdue > 0 ? "font-semibold text-destructive" : undefined}>{row.overdue}</Td>
                    <Td>{row.closing}</Td>
                    <Td>{row.joinedGroup}</Td>
                    <Td className="font-semibold">{row.total}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({ children, align = "center" }: { children: ReactNode; align?: "left" | "center" }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground ${align === "left" ? "text-left" : "text-center"}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-center tabular ${className ?? ""}`}>{children}</td>;
}
