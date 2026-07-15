"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

const linkClass = "block px-3 py-2 text-slate-700 hover:bg-slate-50";

export default function AppMobileMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
        className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
      >
        <Menu className="h-3.5 w-3.5" />
        Menu
      </button>
      {open ? (
        <nav className="absolute left-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          <Link href="/app/dashboard" className={linkClass} prefetch onClick={close}>
            Dashboard
          </Link>
          <Link href="/app/deals" className={linkClass} prefetch onClick={close}>
            Sales Registry
          </Link>
          <Link href="/app/deals/new" className={linkClass} prefetch onClick={close}>
            Log Transaction
          </Link>
          <Link href="/app/setup" className={linkClass} prefetch onClick={close}>
            Setup & Config
          </Link>
          <Link href="/app/calendar" className={linkClass} prefetch onClick={close}>
            Pace Calendar
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
