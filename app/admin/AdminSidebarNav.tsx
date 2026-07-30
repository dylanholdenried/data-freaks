"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, ClipboardList, Package, Upload } from "lucide-react";

const navLink =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10 hover:text-white";
const navLinkActive = `${navLink} bg-blue-500/25 font-medium text-white`;

const links = [
  {
    href: "/admin/requests",
    label: "Requests",
    icon: ClipboardList,
    match: (p: string) => p.startsWith("/admin/requests"),
  },
  {
    href: "/admin/groups",
    label: "Auto Groups",
    icon: Building2,
    match: (p: string) => p.startsWith("/admin/groups"),
  },
  {
    href: "/admin/bulk-upload",
    label: "Bulk upload",
    icon: Upload,
    match: (p: string) => p.startsWith("/admin/bulk-upload"),
  },
  {
    href: "/admin/inventory-upload",
    label: "Inventory upload",
    icon: Package,
    match: (p: string) => p.startsWith("/admin/inventory-upload"),
  },
  {
    href: "/app/dashboard",
    label: "Store view",
    icon: BarChart3,
    match: (p: string) => p.startsWith("/app"),
  },
] as const;

export default function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2 px-3 py-4 text-xs">
      {links.map(({ href, label, icon: Icon, match }) => {
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
    </nav>
  );
}
