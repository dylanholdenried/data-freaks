"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Lock, Menu, X } from "lucide-react";
import { navAccessState, type PlanTier } from "@/lib/plan-access";
import { isViewerNavHref } from "@/lib/roles";
import { cn } from "@/lib/utils";
import AutoGroupSwitcher, { type AutoGroupOption } from "./AutoGroupSwitcher";

const linkClass =
  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted";
const linkLocked =
  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/80 hover:bg-muted";

type NavItem = { href: string; label: string };

const SECTIONS: { title: string; links: NavItem[] }[] = [
  {
    title: "Log",
    links: [
      { href: "/app/dashboard", label: "Dashboard" },
      { href: "/app/deals", label: "Sales Registry" },
      { href: "/app/setup", label: "Setup & Config" },
      { href: "/app/calendar", label: "Calendar" },
      { href: "/app/deals/new", label: "New Deal" },
    ],
  },
  {
    title: "Analyze",
    links: [
      { href: "/app/salesperson-leaderboard", label: "Salesperson Leaderboard" },
      { href: "/app/profit-center", label: "Profit Center" },
    ],
  },
  {
    title: "Advise",
    links: [
      { href: "/app/inventory-command", label: "Inventory Command" },
      { href: "/app/buy-box", label: "Buy-Box" },
    ],
  },
];

export default function AppMobileMenu({
  isPlatformAdmin = false,
  groups = [],
  selectedGroupId = null,
  plan = "log",
  viewOnly = false,
}: {
  isPlatformAdmin?: boolean;
  groups?: AutoGroupOption[];
  selectedGroupId?: string | null;
  plan?: PlanTier | string | null;
  viewOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
      >
        <Menu className="h-3.5 w-3.5" />
        Menu
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={close}
          />
          <aside
            id={titleId}
            role="dialog"
            aria-modal="true"
            aria-label="App navigation"
            className="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] max-w-full flex-col border-r border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Menu</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {isPlatformAdmin ? (
              <div className="border-b border-border py-3">
                <AutoGroupSwitcher
                  groups={groups}
                  selectedGroupId={selectedGroupId}
                  variant="mobile"
                />
              </div>
            ) : null}
            <nav className="flex-1 space-y-5 overflow-y-auto p-3">
              {SECTIONS.map(({ title, links }) => {
                const visibleLinks = viewOnly
                  ? links.filter((link) => isViewerNavHref(link.href))
                  : links;
                if (visibleLinks.length === 0) return null;
                return (
                  <div key={title} className="space-y-1">
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {title}
                    </p>
                    {visibleLinks.map(({ href, label }) => {
                      const locked = navAccessState(plan, href) === "locked";
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={cn(locked ? linkLocked : linkClass)}
                          prefetch
                          onClick={close}
                          title={locked ? `Requires ${title} plan` : undefined}
                        >
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {locked ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" /> : null}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            {isPlatformAdmin ? (
              <div className="border-t border-border p-3">
                <Link href="/admin" className={linkClass} prefetch onClick={close}>
                  Platform Admin
                </Link>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
