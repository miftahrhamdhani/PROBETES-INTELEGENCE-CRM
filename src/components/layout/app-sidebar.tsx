"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  activeCategoryFor,
  isActivePath,
  visibleNavNodes,
  type NavCategoryNode,
  type NavLeaf,
  type NavLeafNode,
} from "./nav-tree";
import { cn } from "@/lib/utils";
import type { ActiveDatasetInfo } from "@/lib/dataset-types";
import type { UserRole } from "@/lib/roles";
import { EAGER_PREFETCH_HREFS, usePrefetchLinkProps } from "./prefetch";



/** Dipertahankan dari versi lama supaya preferensi user yang sudah tersimpan
 *  tetap valid: "true"/hilang = expanded, "false" = collapsed (dulu berarti
 *  disembunyikan total, sekarang berarti rail — makna boolean-nya sama). */
const SIDEBAR_OPEN_KEY = "sidebar-open";
const OPEN_CATEGORIES_KEY = "sidebar-open-categories";
const FLYOUT_CLOSE_DELAY = 180;


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
  role,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  dataset: ActiveDatasetInfo;
  /** Dari sesi server (AppShell -> AppShellClient), bukan `useSession()` client
   *  — dulu sidebar bisa kosong total karena role transien-undefined tepat di
   *  jendela remount (tiap halaman mounting ulang AppSidebar, ditambah
   *  loading.tsx yang menambah satu mount lagi). Middleware sudah memverifikasi
   *  akses sebelum halaman ini dirender, jadi role dari server selalu benar
   *  dan tidak pernah kosong sesaat seperti hook client. */
  role: UserRole | undefined;
}) {
  const pathname = usePathname();
  const reduceMotion = !!useReducedMotion();

  const visibleNodes = React.useMemo(() => visibleNavNodes(role), [role]);
  const activeCategoryId = React.useMemo(
    () => activeCategoryFor(visibleNodes, pathname),
    [visibleNodes, pathname]
  );

  // Lazy initializer (bukan `new Set()` kosong): kategori yang berisi route
  // aktif SUDAH terbuka pada render PERTAMA — termasuk HTML dari server.
  // `activeCategoryId` dihitung murni dari `pathname` (tersedia identik di
  // server maupun client via `usePathname()`), jadi initializer ini
  // menghasilkan Set yang sama di kedua sisi -> tidak ada hydration mismatch,
  // dan tidak ada flash "tertutup lalu terbuka" untuk kategori aktif.
  const [openCategories, setOpenCategories] = React.useState<Set<string>>(() =>
    activeCategoryId ? new Set([activeCategoryId]) : new Set()
  );
  const [hydrated, setHydrated] = React.useState(false);

  // Gabungkan preferensi localStorage (kategori LAIN yang pernah dibuka user)
  // sekali di client — union, bukan replace, supaya kategori aktif yang sudah
  // terbuka sejak initial state di atas tidak pernah ikut tertutup.
  React.useEffect(() => {
    const persisted = readPersistedCategories();
    if (persisted.size) {
      setOpenCategories((prev) => new Set([...prev, ...persisted]));
    }
    setHydrated(true);
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
          "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col bg-card transition-[width] duration-200 ease-in-out motion-reduce:transition-none lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
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

        <div className="p-3">
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
          <div className={cn("mt-2 flex", collapsed ? "justify-center" : "justify-end")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={onToggleCollapsed}
                  aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ActivePill({ reduceMotion, layoutId }: { reduceMotion: boolean; layoutId: string }) {
  if (reduceMotion) return <span className="absolute inset-0 rounded-md bg-[#020945] dark:bg-white" aria-hidden="true" />;
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-md bg-[#020945] dark:bg-white"
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      aria-hidden="true"
    />
  );
}

function ExpandedLeaf({ node, active, reduceMotion }: { node: NavLeafNode; active: boolean; reduceMotion: boolean }) {
  const Icon = node.icon;
  const prefetchProps = usePrefetchLinkProps(node.href);
  return (
    <Link
      href={node.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary-foreground shadow-sm dark:text-[#020945]" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      {...prefetchProps}
    >
      {active ? <ActivePill reduceMotion={reduceMotion} layoutId="sidebar-active-pill-expanded" /> : null}
      <Icon className="relative z-10 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="relative z-10">{node.label}</span>
    </Link>
  );
}

function ExpandedChildLink({ item, active, reduceMotion }: { item: NavLeaf; active: boolean; reduceMotion: boolean }) {
  const Icon = item.icon;
  const prefetchProps = usePrefetchLinkProps(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md pl-4 pr-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary-foreground dark:text-[#020945]" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      {...prefetchProps}
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
  const router = useRouter();
  const panelId = `sidebar-panel-${node.id}`;
  const hasActiveChild = node.items.some((item) => isActivePath(pathname, item.href));
  const children = (
    <div className="space-y-0.5 py-1 pl-3">
      {node.items.map((item) => (
        <ExpandedChildLink key={item.href} item={item} active={isActivePath(pathname, item.href)} reduceMotion={reduceMotion} />
      ))}
    </div>
  );
  // Hover/focus di header kategori (sebelum diklik) sudah cukup sinyal niat
  // membuka — prefetch anak-anaknya lebih awal daripada menunggu klik.
  const prefetchChildren = React.useCallback(() => {
    for (const item of node.items) {
      if (!EAGER_PREFETCH_HREFS.has(item.href)) router.prefetch(item.href);
    }
  }, [node.items, router]);

  // `motion.div initial={{height:0}}` menentukan style paint PERTAMA (termasuk
  // HTML dari server) terlepas dari nilai `open` — kategori yang aktif sejak
  // mount akan tetap ter-render height:0 lalu di-animate ke auto, alih-alih
  // langsung terbuka penuh. Render statis (tanpa motion) untuk paint pertama
  // ini, baru pakai motion.div untuk toggle SESUDAH mount — supaya animasi
  // buka/tutup tetap halus saat user benar-benar mengklik.
  const skipEnterAnimation = React.useRef(true);
  React.useEffect(() => {
    skipEnterAnimation.current = false;
  }, []);
  const renderStatic = reduceMotion || skipEnterAnimation.current;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={prefetchChildren}
        onFocus={prefetchChildren}
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
      {renderStatic ? (
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
  const prefetchProps = usePrefetchLinkProps(node.href);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={node.href}
          aria-current={active ? "page" : undefined}
          aria-label={node.label}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-primary-foreground dark:text-[#020945]" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          {...prefetchProps}
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
  const router = useRouter();
  // Flyout rail: kategori (bukan item) yang di-hover — prefetch seluruh item
  // di dalamnya sekaligus saat flyout terbuka, karena user hampir pasti akan
  // mengklik salah satunya begitu panel terlihat.
  const prefetchChildren = React.useCallback(() => {
    for (const item of node.items) {
      if (!EAGER_PREFETCH_HREFS.has(item.href)) router.prefetch(item.href);
    }
  }, [node.items, router]);
  const handleOpen = React.useCallback(() => {
    onOpen();
    prefetchChildren();
  }, [onOpen, prefetchChildren]);
  return (
    <Popover open={open} onOpenChange={(next) => (!next ? onCloseNow() : undefined)}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={node.label}
          onMouseEnter={handleOpen}
          onMouseLeave={onCloseDebounced}
          onFocus={handleOpen}
          onClick={() => (open ? onCloseNow() : handleOpen())}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-primary-foreground dark:text-[#020945]" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
                  itemActive ? "bg-[#020945] text-primary-foreground dark:bg-white dark:text-[#020945]" : "text-foreground hover:bg-accent"
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
