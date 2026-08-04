"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { activeCategoryFor, isActivePath, resolveStableRole, visibleNavNodes } from "./nav-tree";

/**
 * Navigasi untuk viewport < lg. Sidebar desktop `hidden lg:flex`, sehingga tanpa
 * ini tidak ada jalan berpindah halaman sama sekali di layar kecil.
 *
 * Memakai NAV_TREE + filter role YANG SAMA dengan sidebar (./nav-tree) — tidak
 * ada struktur menu kedua yang diketik manual. Sheet dari shadcn sudah menangani
 * Escape, klik di luar, focus trap, dan aria-modal.
 */
export function MobileNav() {
  const pathname = usePathname();
  // resolveStableRole: lihat catatan bug "sidebar suka kosong" di nav-tree.ts —
  // role transien-undefined saat remount tidak boleh mengosongkan menu.
  const role = resolveStableRole(useSession().data?.user?.role);
  const [open, setOpen] = React.useState(false);

  const nodes = React.useMemo(() => visibleNavNodes(role), [role]);
  const activeCategoryId = React.useMemo(() => activeCategoryFor(nodes, pathname), [nodes, pathname]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  // Kategori yang memuat halaman aktif selalu terbuka saat drawer dibuka.
  React.useEffect(() => {
    if (open && activeCategoryId) setExpanded((prev) => new Set(prev).add(activeCategoryId));
  }, [open, activeCategoryId]);

  // Tutup otomatis setelah pindah halaman.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-foreground dark:hover:bg-accent dark:hover:text-accent-foreground lg:hidden"
          aria-label="Buka menu navigasi"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle className="flex items-center gap-2.5 pr-8">
            <Image src="/probetes-logo.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-cover" />
            <span className="text-left text-sm font-bold tracking-tight">PROBETES INTELEGENCE CRM</span>
          </SheetTitle>
        </SheetHeader>

        <nav className="scrollbar-thin max-h-[calc(100vh-5rem)] space-y-1 overflow-y-auto p-3" aria-label="Navigasi utama (mobile)">
          {nodes.map((node) => {
            if (node.kind === "leaf") {
              const Icon = node.icon;
              const active = isActivePath(pathname, node.href);
              return (
                <Link
                  key={node.id}
                  href={node.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    active ? "bg-[#020945] text-primary-foreground dark:bg-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {node.label}
                </Link>
              );
            }

            const Icon = node.icon;
            const isOpen = expanded.has(node.id);
            const panelId = `mobile-nav-${node.id}`;
            return (
              <div key={node.id}>
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    activeCategoryId === node.id ? "font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{node.label}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
                </button>
                {isOpen ? (
                  <div id={panelId} className="space-y-0.5 py-1 pl-4">
                    {node.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors",
                            active ? "bg-[#020945] text-primary-foreground dark:bg-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
