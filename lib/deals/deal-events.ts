import { formatProfileName, formatRoleLabel } from "@/lib/profile-display";

export type DealEventRow = {
  id: string;
  event_type: "created" | "status_changed" | string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_role: string | null;
};

const LOCKED_STATUSES = new Set(["closed", "dead", "unwound"]);

export function formatDealEventAction(event: DealEventRow): string {
  if (event.event_type === "created") {
    return "created this deal";
  }

  if (event.event_type === "status_changed") {
    const from = event.from_status ?? "";
    const to = event.to_status ?? "";

    if (LOCKED_STATUSES.has(from) && (to === "pending" || to === "delivered")) {
      const label = to === "pending" ? "Pending" : "Delivered";
      return `re-opened the deal as ${label}`;
    }

    switch (to) {
      case "delivered":
        return "marked the deal delivered";
      case "closed":
        return "marked the deal closed";
      case "dead":
        return "marked the deal lost";
      case "unwound":
        return "unwound this deal";
      case "pending":
        return "set the deal to Pending";
      default:
        return `changed status to ${to || "unknown"}`;
    }
  }

  return "updated this deal";
}

export function formatDealEventActor(event: DealEventRow): string {
  const name = formatProfileName(event.actor_first_name, event.actor_last_name);
  if (!event.actor_first_name && !event.actor_last_name && !event.actor_role) {
    return "Unknown user";
  }
  if (!event.actor_role) return name;
  return `${name} (${formatRoleLabel(event.actor_role)})`;
}

export function formatDealEventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
