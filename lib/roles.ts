/** Platform staff roles that can access /admin and pass is_platform_admin() RLS. */

export type PlatformStaffRole = "owner_admin" | "platform_admin";

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
  return role === "group_admin" || role === "store_admin";
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
