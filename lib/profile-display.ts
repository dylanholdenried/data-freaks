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
    case "store_viewer":
      return "View Only";
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

export function formatStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "invited":
      return "Invited";
    case "active":
      return "Active";
    case "disabled":
      return "Disabled";
    default:
      if (!status) return "Unknown";
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
