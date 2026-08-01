"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Boxes,
  Briefcase,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Database,
  FileClock,
  FileText,
  LayoutDashboard,
  ListTodo,
  Map,
  SearchCheck,
  Settings2,
  SlidersHorizontal,
  SquareKanban,
  Tags,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { canAccessPath } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ActiveDatasetInfo } from "@/lib/dataset-types";

type NavLeaf = { href: string; label: string; icon: LucideIcon };
type NavLeafNode = NavLeaf & { kind: "leaf"; id: string };
type NavCategoryNode = { kind: "category"; id: string; label: string; icon: LucideIcon; items: NavLeaf[] };
type NavNode = NavLeafNode | NavCategoryNode;

// Matriks role: docs/05-UI.md §3, sumber tunggal src/lib/roles.ts (dipakai
// middleware juga) — menu yang tidak boleh diakses tidak ditampilkan.
const NAV_TREE: NavNode[] = [
  { kind: "leaf", id: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    kind: "category",
    id: "analytics",
    label: "Analytics",
    icon: TrendingUp,
    items: [
      { href: "/cohort", label: "Cohort & Retention", icon: Map },
      { href: "/frequency", label: "Frequency", icon: BarChart3 },
      { href: "/rfm", label: "RFM Analysis", icon: ChartNoAxesCombined },
      { href: "/cluster", label: "Customer Cluster", icon: Boxes },
    ],
  },
  {
    kind: "category",
    id: "customer",
    label: "Customer",
    icon: Users,
    items: [
      { href: "/customers", label: "Customers", icon: UserRound },
      { href: "/groups", label: "Group Membership", icon: UsersRound },
    ],
  },
  {
    kind: "category",
    id: "workspace",
    label: "Workspace",
    icon: Briefcase,
    items: [
      { href: "/workspace/overview", label: "Overview", icon: SquareKanban },
      { href: "/workspace/pembagian-tugas", label: "Pembagian Tugas", icon: ListTodo },
      { href: "/workspace/input-kerja", label: "Input Kerja", icon: ClipboardList },
      { href: "/workspace/laporan-kerja", label: "Laporan Kerja", icon: FileText },
    ],
  },
  {
    kind: "category",
    id: "data",
    label: "Data",
    icon: Database,
    items: [
      { href: "/import", label: "Import Database", icon: Upload },
      { href: "/mapping", label: "Product Mapping", icon: Tags },
      { href: "/quality", label: "Data Quality", icon: SearchCheck },
      { href: "/history", label: "Import History", icon: FileClock },
    ],
  },
  {
    kind: "category",
    id: "system",
    label: "System",
    icon: Settings2,
    items: [
      { href: "/rules", label: "Cluster Rules", icon: SlidersHorizontal },
      { href: "/users", label: "Users", icon: UsersRound },
    ],
  },
];

/** Dipertahankan dari versi lama supaya preferensi user yang sudah tersimpan
 *  tetap valid: "true"/hilang = expanded, "false" = collapsed (dulu berarti
 *  disembunyikan total, sekarang berarti rail — makna boolean-nya sama). */
const SIDEBAR_OPEN_KEY = "sidebar-open";
const OPEN_CATEGORIES_KEY = "sidebar-open-categories";
const FLYOUT_CLOSE_DELAY = 180;

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readPersistedCategories(): Set<string> {
  try {
    const raw = localStorage.getItem(OPEN_CATEGORIES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function persistCategories(set: Set<string>) {
  try {
    localStorage.setItem(OPEN_CATEGORIES_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage tidak tersedia (mis. private mode) — state tetap jalan di memori, cuma tidak persist.
  }
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  dataset,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  dataset: ActiveDatasetInfo;
}) {
  const pathname = usePathname();
  const role = useSession().data?.user?.role;
  const reduceMotion = !!useReducedMotion();

  const visibleNodes = React.useMemo(() => {
    const nodes: NavNode[] = [];
    for (const node of NAV_TREE) {
      if (node.kind === "leaf") {
        if (canAccessPath(role, node.href)) nodes.push(node);
      } else {
        const items = node.items.filter((item) => canAccessPath(role, item.href));
        if (items.length) nodes.push({ ...node, items });
      }
    }
    return nodes;
  }, [role]);

  const activeCategoryId = React.useMemo(() => {
    const match = visibleNodes.find(
      (node) => node.kind === "category" && node.items.some((item) => isActivePath(pathname, item.href))
    );
    return match?.id ?? null;
  }, [visibleNodes, pathname]);

  const [openCategories, setOpenCategories] = React.useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = React.useState(false);

  // Muat state persisted sekali di client (localStorage tidak ada saat SSR) —
  // kategori aktif (dari route saat ini) selalu ikut dibuka.
  React.useEffect(() => {
    const initial = readPersistedCategories();
    if (activeCategoryId) initial.add(activeCategoryId);
    setOpenCategories(initial);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pindah halaman ke kategori yang sedang tertutup -> buka otomatis (merge,
  // TIDAK PERNAH menutup kategori lain — lihat requirement "jangan menutup
  // kategori aktif secara membingungkan saat pindah halaman").
  React.useEffect(() => {
    if (!hydrated || !activeCategoryId) return;
    setOpenCategories((prev) => {
      if (prev.has(activeCategoryId)) return prev;
      const next = new Set(prev).add(activeCategoryId);
      persistCategories(next);
      return next;
    });
  }, [activeCategoryId, hydrated]);

  const toggleCategory = React.useCallback((id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistCategories(next);
      return next;
    });
  }, []);

  // Floating submenu (mode collapsed) — hover/focus buka dengan sedikit delay
  // saat menutup (supaya pindah dari icon ke panel tidak langsung menutup),
  // klik/Escape/klik-di-luar menutup seketika (ditangani PopoverContent).
  const [flyoutId, setFlyoutId] = React.useState<string | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const openFlyout = React.useCallback(
    (id: string) => {
      clearCloseTimer();
      setFlyoutId(id);
    },
    [clearCloseTimer]
  );
  const closeFlyoutDebounced = React.useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setFlyoutId(null), FLYOUT_CLOSE_DELAY);
  }, [clearCloseTimer]);
  const closeFlyoutNow = React.useCallback(() => {
    clearCloseTimer();
    setFlyoutId(null);
  }, [clearCloseTimer]);

  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);
  React.useEffect(() => {
    closeFlyoutNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  React.useEffect(() => {
    if (!collapsed) closeFlyoutNow();
  }, [collapsed, closeFlyoutNow]);

  return (
    <TooltipProvider delayDuration={250}>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-in-out motion-reduce:transition-none lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("flex items-center gap-2 border-b py-4", collapsed ? "justify-center px-2" : "px-3")}>
          <div className={cn("flex min-w-0 items-center gap-2.5", !collapsed && "flex-1 px-2")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CircleGauge className="h-5 w-5" aria-hidden="true" />
            </div>
            <AnimatePresence initial={false}>
              {!collapsed ? (
                <motion.div
                  key="brand"
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tracking-tight">PROBETES</span>
                    <Badge className="px-1.5 py-0 text-[9px]">V1</Badge>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">Customer Intelligence</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onToggleCollapsed}
              aria-label="Ciutkan sidebar"
              title="Ciutkan sidebar"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="flex justify-center border-b py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={onToggleCollapsed}
                  aria-label="Perluas sidebar"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Perluas sidebar</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <nav
          className={cn("scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden py-3", collapsed ? "px-2" : "px-3")}
          aria-label="Navigasi utama"
        >
          <div className={cn(collapsed ? "flex flex-col items-center gap-1" : "space-y-1")}>
            {visibleNodes.map((node) => {
              if (node.kind === "leaf") {
                return collapsed ? (
                  <RailLeaf key={node.id} node={node} active={isActivePath(pathname, node.href)} reduceMotion={reduceMotion} />
                ) : (
                  <ExpandedLeaf key={node.id} node={node} active={isActivePath(pathname, node.href)} reduceMotion={reduceMotion} />
                );
              }
              return collapsed ? (
                <RailCategory
                  key={node.id}
                  node={node}
                  pathname={pathname}
                  active={activeCategoryId === node.id}
                  open={flyoutId === node.id}
                  onOpen={() => openFlyout(node.id)}
                  onCloseDebounced={closeFlyoutDebounced}
                  onCloseNow={closeFlyoutNow}
                  reduceMotion={reduceMotion}
                />
              ) : (
                <ExpandedCategory
                  key={node.id}
                  node={node}
                  pathname={pathname}
                  open={openCategories.has(node.id)}
                  onToggle={() => toggleCategory(node.id)}
                  reduceMotion={reduceMotion}
                />
              );
            })}
          </div>
        </nav>

        <div className="border-t p-3">
          {collapsed ? (
            <div className="flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "flex h-9 w-9 cursor-default items-center justify-center rounded-md",
                      dataset.databaseAllActive ? "bg-green-100 dark:bg-green-950/40" : "bg-amber-100 dark:bg-amber-950/40"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        dataset.databaseAllActive ? "bg-green-600" : "bg-amber-600"
                      )}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{dataset.databaseAllActive ? "Database aktif" : "Belum ada dataset aktif"}</p>
                  <p className="text-muted-foreground">Data as of {formatDate(dataset.asOfDate)}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs font-medium">Database {dataset.databaseAllActive ? "aktif" : "belum aktif"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Data as of {formatDate(dataset.asOfDate)}</p>
              <div
                className={cn(
                  "mt-2 flex items-center gap-1.5 text-[11px]",
                  dataset.databaseAllActive ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", dataset.databaseAllActive ? "bg-green-600" : "bg-amber-600")} />
                {dataset.databaseAllActive ? "Database All sinkron" : "Belum ada dataset aktif"}
              </div>
              {dataset.databaseAllActive && (!dataset.ksbActive || !dataset.groupListActive) ? (
                <p className="mt-1 text-[10px] text-muted-foreground">KSB / Group List belum diimport</p>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ActivePill({ reduceMotion, layoutId }: { reduceMotion: boolean; layoutId: string }) {
  if (reduceMotion) return <span className="absolute inset-0 rounded-md bg-primary" aria-hidden="true" />;
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-md bg-primary"
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      aria-hidden="true"
    />
  );
}

function ExpandedLeaf({ node, active, reduceMotion }: { node: NavLeafNode; active: boolean; reduceMotion: boolean }) {
  const Icon = node.icon;
  return (
    <Link
      href={node.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {active ? <ActivePill reduceMotion={reduceMotion} layoutId="sidebar-active-pill-expanded" /> : null}
      <Icon className="relative z-10 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="relative z-10">{node.label}</span>
    </Link>
  );
}

function ExpandedChildLink({ item, active, reduceMotion }: { item: NavLeaf; active: boolean; reduceMotion: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md pl-4 pr-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {active ? <ActivePill reduceMotion={reduceMotion} layoutId="sidebar-active-pill-expanded" /> : null}
      <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="relative z-10 truncate">{item.label}</span>
    </Link>
  );
}

function ExpandedCategory({
  node,
  pathname,
  open,
  onToggle,
  reduceMotion,
}: {
  node: NavCategoryNode;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  reduceMotion: boolean;
}) {
  const Icon = node.icon;
  const panelId = `sidebar-panel-${node.id}`;
  const hasActiveChild = node.items.some((item) => isActivePath(pathname, item.href));
  const children = (
    <div className="space-y-0.5 py-1 pl-3">
      {node.items.map((item) => (
        <ExpandedChildLink key={item.href} item={item} active={isActivePath(pathname, item.href)} reduceMotion={reduceMotion} />
      ))}
    </div>
  );

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          hasActiveChild ? "font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{node.label}</span>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </motion.span>
      </button>
      {reduceMotion ? (
        open ? (
          <div id={panelId}>{children}</div>
        ) : null
      ) : (
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={panelId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              {children}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
}

function RailLeaf({ node, active, reduceMotion }: { node: NavLeafNode; active: boolean; reduceMotion: boolean }) {
  const Icon = node.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={node.href}
          aria-current={active ? "page" : undefined}
          aria-label={node.label}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {active ? <ActivePill reduceMotion={reduceMotion} layoutId="sidebar-active-pill-rail" /> : null}
          <Icon className="relative z-10 h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{node.label}</TooltipContent>
    </Tooltip>
  );
}

function RailCategory({
  node,
  pathname,
  active,
  open,
  onOpen,
  onCloseDebounced,
  onCloseNow,
  reduceMotion,
}: {
  node: NavCategoryNode;
  pathname: string;
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onCloseDebounced: () => void;
  onCloseNow: () => void;
  reduceMotion: boolean;
}) {
  const Icon = node.icon;
  return (
    <Popover open={open} onOpenChange={(next) => (!next ? onCloseNow() : undefined)}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={node.label}
          onMouseEnter={onOpen}
          onMouseLeave={onCloseDebounced}
          onFocus={onOpen}
          onClick={() => (open ? onCloseNow() : onOpen())}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {active ? <ActivePill reduceMotion={reduceMotion} layoutId="sidebar-active-pill-rail" /> : null}
          <Icon className="relative z-10 h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        onMouseEnter={onOpen}
        onMouseLeave={onCloseDebounced}
        onFocusCapture={onOpen}
        onBlurCapture={onCloseDebounced}
        className="w-56 p-1.5"
      >
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{node.label}</p>
        <div className="space-y-0.5">
          {node.items.map((item) => {
            const ItemIcon = item.icon;
            const itemActive = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={itemActive ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                  itemActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                )}
              >
                <ItemIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
}

export { SIDEBAR_OPEN_KEY };
