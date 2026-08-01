/** Display helpers for profile chrome (sidebar / header). */

export function formatProfileName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || "User";
}

export function formatRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "owner_admin":
      return "Owner";
    case "platform_admin":
      return "Platform Admin";
    case "group_admin":
      return "Group Admin";
    case "store_admin":
      return "Store Admin";
    case "salesperson":
      return "Salesperson";
    case "finance_manager":
      return "Finance Manager";
    default:
      if (!role) return "User";
      return role
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}
