/**
 * Struktur menu — SATU sumber untuk sidebar desktop DAN drawer mobile.
 * Tidak boleh ada daftar menu kedua yang diketik manual di tempat lain.
 *
 * Matriks role: docs/05-UI.md §3, sumber tunggal src/lib/roles.ts (dipakai
 * middleware juga) — menu yang tidak boleh diakses tidak ditampilkan.
 */
import {
  BarChart3,
  Boxes,
  Briefcase,
  ChartNoAxesCombined,
  ClipboardList,
  Database,
  FileClock,
  LayoutDashboard,
  ListTodo,
  Map,
  Package,
  Receipt,
  Scale,
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
import { canAccessPath, type UserRole } from "@/lib/roles";

export type NavLeaf = { href: string; label: string; icon: LucideIcon };
export type NavLeafNode = NavLeaf & { kind: "leaf"; id: string };
export type NavCategoryNode = {
  kind: "category";
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
};
export type NavNode = NavLeafNode | NavCategoryNode;

export const NAV_TREE: NavNode[] = [
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
      { href: "/workspace/pesanan", label: "Pesanan", icon: ClipboardList },
      { href: "/workspace/pembagian-tugas", label: "Pembagian Tugas", icon: ListTodo },
      { href: "/workspace/master-data", label: "Master Data", icon: Package },
      { href: "/workspace/biaya-operasional", label: "Biaya Operasional", icon: Receipt },
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
      { href: "/reconciliation", label: "Reconciliation", icon: Scale },
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

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Menu yang boleh dilihat role ini — kategori kosong ikut disembunyikan. */
export function visibleNavNodes(role: UserRole | undefined): NavNode[] {
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
}

export function activeCategoryFor(nodes: NavNode[], pathname: string): string | null {
  const match = nodes.find(
    (node) => node.kind === "category" && node.items.some((item) => isActivePath(pathname, item.href))
  );
  return match?.id ?? null;
}

