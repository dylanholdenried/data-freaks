"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { canAccessAppNav, type PlanTier } from "@/lib/plan-access";
import AutoGroupSwitcher, { type AutoGroupOption } from "./AutoGroupSwitcher";

const linkClass =
  "block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

const links = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/profit-center", label: "Profit Center" },
  { href: "/app/inventory-command", label: "Inventory Command" },
  { href: "/app/deals", label: "Sales Registry" },
  { href: "/app/deals/new", label: "Log Transaction" },
  { href: "/app/setup", label: "Setup & Config" },
  { href: "/app/calendar", label: "Pace Calendar" },
] as const;

export default function AppMobileMenu({
  isPlatformAdmin = false,
  groups = [],
  selectedGroupId = null,
  plan = "log",
}: {
  isPlatformAdmin?: boolean;
  groups?: AutoGroupOption[];
  selectedGroupId?: string | null;
  plan?: PlanTier | string | null;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const visible = links.filter((l) => canAccessAppNav(plan, l.href));

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
        className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
      >
        <Menu className="h-3.5 w-3.5" />
        Menu
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={close}
          />
          <aside
            id={titleId}
            role="dialog"
            aria-modal="true"
            aria-label="App navigation"
            className="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] max-w-full flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Menu</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {isPlatformAdmin ? (
              <div className="border-b border-slate-200 py-3">
                <AutoGroupSwitcher
                  groups={groups}
                  selectedGroupId={selectedGroupId}
                  variant="mobile"
                />
              </div>
            ) : null}
            <nav className="flex-1 overflow-y-auto p-3">
              {visible.map(({ href, label }) => (
                <Link key={href} href={href} className={linkClass} prefetch onClick={close}>
                  {label}
                </Link>
              ))}
              {isPlatformAdmin ? (
                <Link href="/admin" className={linkClass} prefetch onClick={close}>
                  Platform Admin
                </Link>
              ) : null}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
