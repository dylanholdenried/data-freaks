/** Platform staff roles that can access /admin and pass is_platform_admin() RLS. */

export type PlatformStaffRole = "owner_admin" | "platform_admin";

/** Auto-group roles managed in the Auto Group Users list (not platform staff). */
export type AutoGroupUserRole = "group_admin" | "store_admin" | "store_viewer";

/** Roles that require explicit user_store_access rows. */
export type StoreScopedRole = "store_admin" | "store_viewer";

export function isOwnerAdmin(role: string | null | undefined): boolean {
  return role === "owner_admin";
}

export function isPlatformStaff(role: string | null | undefined): boolean {
  return role === "owner_admin" || role === "platform_admin";
}

/** Roles shown in the Platform Admins list on /admin/users. */
export function isPlatformAdminListRole(role: string | null | undefined): boolean {
  return isPlatformStaff(role);
}

/** Auto-group roles managed in the Auto Group Users list. */
export function isAutoGroupUserRole(role: string | null | undefined): boolean {
  return role === "group_admin" || role === "store_admin" || role === "store_viewer";
}

export function isStoreViewer(role: string | null | undefined): boolean {
  return role === "store_viewer";
}

/** Store-scoped roles that use user_store_access checkboxes. */
export function isStoreScopedRole(role: string | null | undefined): boolean {
  return role === "store_admin" || role === "store_viewer";
}

/** False for View Only users — no create/update/delete of app data. */
export function canMutateAppData(role: string | null | undefined): boolean {
  return !isStoreViewer(role);
}

/** Roles allowed to reopen locked deals (closed / dead / unwound). */
export function canReopenDeal(role: string | null | undefined): boolean {
  return (
    role === "store_admin" ||
    role === "group_admin" ||
    role === "platform_admin" ||
    role === "owner_admin"
  );
}

/**
 * Paths a store_viewer may open under /app.
 * Deal detail uses the existing /edit route in read-only mode.
 */
export function canAccessViewerAppPath(pathname: string): boolean {
  const p = pathname.split("?")[0].replace(/\/$/, "") || "/";
  if (p === "/app") return true;
  if (p.startsWith("/app/dashboard")) return true;
  if (p.startsWith("/app/calendar")) return true;
  if (p.startsWith("/app/salesperson-leaderboard")) return true;
  if (p === "/app/deals") return true;
  if (p.startsWith("/app/deals/")) {
    if (p === "/app/deals/new" || p.startsWith("/app/deals/new/")) return false;
    return true;
  }
  return false;
}

/** Nav hrefs shown to store_viewer users. */
export const VIEWER_NAV_HREFS = new Set([
  "/app/dashboard",
  "/app/deals",
  "/app/calendar",
  "/app/salesperson-leaderboard",
]);

export function isViewerNavHref(href: string): boolean {
  return VIEWER_NAV_HREFS.has(href);
}
