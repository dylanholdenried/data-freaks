"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  LayoutDashboard,
  ListOrdered,
  Settings2,
  CircleDollarSign,
  Package,
  Trophy,
  Lock,
  Crosshair,
  ShoppingBag,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { navAccessState, requiredProductForHref, type PlanTier } from "@/lib/plan-access";
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
    href: "/app/calendar",
    label: "Calendar",
    icon: CalendarRange,
    match: (p) => p.startsWith("/app/calendar"),
  },
  {
    href: "/app/salesperson-leaderboard",
    label: "Salesperson Leaderboard",
    icon: Trophy,
    match: (p) => p.startsWith("/app/salesperson-leaderboard"),
  },
];

const ANALYZE_LINKS: NavItem[] = [
  {
    href: "/app/profit-center",
    label: "Profit Center",
    icon: CircleDollarSign,
    match: (p) => p.startsWith("/app/profit-center"),
  },
  {
    href: "/app/trades",
    label: "Trades",
    icon: ArrowLeftRight,
    match: (p) => p.startsWith("/app/trades"),
  },
  {
    href: "/app/inventory-command",
    label: "Inventory Command",
    icon: Package,
    match: (p) => p.startsWith("/app/inventory-command"),
  },
];

const ACQUIRE_LINKS: NavItem[] = [
  {
    href: "/app/acquire/purchases",
    label: "Purchases",
    icon: ShoppingBag,
    match: (p) => p.startsWith("/app/acquire/purchases"),
  },
  {
    href: "/app/buy-box",
    label: "Buy-Box",
    icon: Crosshair,
    match: (p) => p.startsWith("/app/buy-box"),
  },
  {
    href: "/app/acquire/performance",
    label: "Performance",
    icon: BarChart3,
    match: (p) => p.startsWith("/app/acquire/performance"),
  },
];

const ACCOUNT_LINKS: NavItem[] = [
  {
    href: "/app/setup",
    label: "Setup & Config",
    icon: Settings2,
    match: (p) => p.startsWith("/app/setup"),
  },
  {
    href: "/app/billing",
    label: "Billing",
    icon: CreditCard,
    match: (p) => p.startsWith("/app/billing"),
  },
];

const SECTIONS: { title: string; links: NavItem[] }[] = [
  { title: "Log", links: LOG_LINKS },
  { title: "Analyze", links: ANALYZE_LINKS },
  { title: "Acquire", links: ACQUIRE_LINKS },
];

function lockTitle(href: string): string {
  const product = requiredProductForHref(href);
  if (product === "acquire") return "Requires Acquire addon";
  if (product === "analyze") return "Requires Analyze plan";
  return "Locked";
}

function NavLinkRow({
  href,
  label,
  icon: Icon,
  match,
  plan,
  acquireEnabled,
}: NavItem & {
  plan?: PlanTier | string | null;
  acquireEnabled?: boolean;
}) {
  const pathname = usePathname();
  const locked = navAccessState(plan, href, { acquireEnabled }) === "locked";
  const active = !locked && match(pathname);
  return (
    <Link
      href={href}
      prefetch
      className={cn(locked ? navLinkLocked : active ? navLinkActive : navLink)}
      aria-current={active ? "page" : undefined}
      title={locked ? lockTitle(href) : undefined}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {locked ? <Lock className="h-3 w-3 shrink-0 opacity-80" /> : null}
    </Link>
  );
}

export default function AppSidebarNav({
  plan = "log",
  acquireEnabled = false,
  viewOnly = false,
  isPlatformAdmin = false,
  showBilling = false,
}: {
  plan?: PlanTier | string | null;
  acquireEnabled?: boolean;
  viewOnly?: boolean;
  /** Performance is unfinished — only platform admins see the nav link. */
  isPlatformAdmin?: boolean;
  showBilling?: boolean;
}) {
  return (
    <nav className="flex flex-1 flex-col px-3 py-4 text-xs">
      <div className="space-y-5">
        {SECTIONS.map(({ title, links }) => {
          let visibleLinks = viewOnly
            ? links.filter((link) => isViewerNavHref(link.href))
            : links;
          if (!isPlatformAdmin) {
            visibleLinks = visibleLinks.filter(
              (link) => link.href !== "/app/acquire/performance"
            );
          }
          if (visibleLinks.length === 0) return null;
          return (
            <div key={title} className="space-y-1.5">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--da-muted)]">
                {title}
              </p>
              <div className="space-y-1">
                {visibleLinks.map((item) => (
                  <NavLinkRow
                    key={item.href}
                    {...item}
                    plan={plan}
                    acquireEnabled={acquireEnabled}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!viewOnly ? (
        <div className="mt-auto space-y-1.5 border-t border-[var(--da-line)] pt-4">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--da-muted)]">
            Account
          </p>
          <div className="space-y-1">
            {ACCOUNT_LINKS.filter(
              (link) => link.href !== "/app/billing" || showBilling
            ).map((item) => (
              <NavLinkRow
                key={item.href}
                {...item}
                plan={plan}
                acquireEnabled={acquireEnabled}
              />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
