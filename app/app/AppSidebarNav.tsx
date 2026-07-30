"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  LayoutDashboard,
  ListOrdered,
  Settings2,
  Shield,
  CircleDollarSign,
  Package,
} from "lucide-react";
import { canAccessAppNav, type PlanTier } from "@/lib/plan-access";

const navLink =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10 hover:text-white";
const navLinkActive = `${navLink} bg-blue-500/25 font-medium text-white`;

const links = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p: string) => p.startsWith("/app/dashboard"),
  },
  {
    href: "/app/profit-center",
    label: "Profit Center",
    icon: CircleDollarSign,
    match: (p: string) => p.startsWith("/app/profit-center"),
  },
  {
    href: "/app/inventory-command",
    label: "Inventory Command",
    icon: Package,
    match: (p: string) => p.startsWith("/app/inventory-command"),
  },
  {
    href: "/app/deals",
    label: "Sales Registry",
    icon: ListOrdered,
    match: (p: string) => p === "/app/deals" || p.startsWith("/app/deals/"),
  },
  {
    href: "/app/setup",
    label: "Setup & Config",
    icon: Settings2,
    match: (p: string) => p.startsWith("/app/setup"),
  },
  {
    href: "/app/calendar",
    label: "Pace Calendar",
    icon: CalendarRange,
    match: (p: string) => p.startsWith("/app/calendar"),
  },
] as const;

export default function AppSidebarNav({
  isPlatformAdmin = false,
  plan = "log",
}: {
  isPlatformAdmin?: boolean;
  plan?: PlanTier | string | null;
}) {
  const pathname = usePathname();
  const visible = links.filter((l) => canAccessAppNav(plan, l.href));

  return (
    <nav className="space-y-2 px-3 py-4 text-xs">
      {visible.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={active ? navLinkActive : navLink}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
      {isPlatformAdmin ? (
        <Link
          href="/admin"
          prefetch
          className={pathname.startsWith("/admin") ? navLinkActive : navLink}
          aria-current={pathname.startsWith("/admin") ? "page" : undefined}
        >
          <Shield className="h-3.5 w-3.5" />
          Platform Admin
        </Link>
      ) : null}
    </nav>
  );
}
