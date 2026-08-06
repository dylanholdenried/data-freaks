"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  CalendarRange,
  LayoutDashboard,
  ListOrdered,
  Settings2,
  CircleDollarSign,
  Package,
  Trophy,
  Lock,
  Crosshair,
} from "lucide-react";
import { navAccessState, type PlanTier } from "@/lib/plan-access";
import { isViewerNavHref } from "@/lib/roles";
import { cn } from "@/lib/utils";

const navLink =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-[var(--da-muted)] hover:bg-[var(--da-panel-2)] hover:text-[var(--da-text)]";
const navLinkActive = `${navLink} bg-[color-mix(in_srgb,var(--da-blue)_25%,transparent)] font-medium text-[var(--da-text)]`;
const navLinkLocked =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-[var(--da-muted)]/70 hover:bg-[var(--da-panel-2)] hover:text-[var(--da-muted)]";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

const LOG_LINKS: NavItem[] = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p.startsWith("/app/dashboard"),
  },
  {
    href: "/app/deals",
    label: "Sales Registry",
    icon: ListOrdered,
    match: (p) => p === "/app/deals" || p.startsWith("/app/deals/"),
  },
  {
    href: "/app/setup",
    label: "Setup & Config",
    icon: Settings2,
    match: (p) => p.startsWith("/app/setup"),
  },
  {
    href: "/app/calendar",
    label: "Calendar",
    icon: CalendarRange,
    match: (p) => p.startsWith("/app/calendar"),
  },
];

const ANALYZE_LINKS: NavItem[] = [
  {
    href: "/app/salesperson-leaderboard",
    label: "Salesperson Leaderboard",
    icon: Trophy,
    match: (p) => p.startsWith("/app/salesperson-leaderboard"),
  },
  {
    href: "/app/profit-center",
    label: "Profit Center",
    icon: CircleDollarSign,
    match: (p) => p.startsWith("/app/profit-center"),
  },
];

const ADVISE_LINKS: NavItem[] = [
  {
    href: "/app/inventory-command",
    label: "Inventory Command",
    icon: Package,
    match: (p) => p.startsWith("/app/inventory-command"),
  },
  {
    href: "/app/buy-box",
    label: "Buy-Box",
    icon: Crosshair,
    match: (p) => p.startsWith("/app/buy-box"),
  },
];

const SECTIONS: { title: string; links: NavItem[] }[] = [
  { title: "Log", links: LOG_LINKS },
  { title: "Analyze", links: ANALYZE_LINKS },
  { title: "Advise", links: ADVISE_LINKS },
];

export default function AppSidebarNav({
  plan = "log",
  viewOnly = false,
}: {
  plan?: PlanTier | string | null;
  viewOnly?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5 px-3 py-4 text-xs">
      {SECTIONS.map(({ title, links }) => {
        const visibleLinks = viewOnly
          ? links.filter((link) => isViewerNavHref(link.href))
          : links;
        if (visibleLinks.length === 0) return null;
        return (
          <div key={title} className="space-y-1.5">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--da-muted)]">
              {title}
            </p>
            <div className="space-y-1">
              {visibleLinks.map(({ href, label, icon: Icon, match }) => {
                const locked = navAccessState(plan, href) === "locked";
                const active = !locked && match(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch
                    className={cn(locked ? navLinkLocked : active ? navLinkActive : navLink)}
                    aria-current={active ? "page" : undefined}
                    title={locked ? `Requires ${title} plan` : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {locked ? <Lock className="h-3 w-3 shrink-0 opacity-80" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
