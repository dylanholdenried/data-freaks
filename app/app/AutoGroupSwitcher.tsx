"use client";

import { useTransition } from "react";
import { setSelectedDealerGroupAction } from "@/app/app/group-actions";

export type AutoGroupOption = { id: string; name: string };

export default function AutoGroupSwitcher({
  groups,
  selectedGroupId,
  variant = "sidebar",
}: {
  groups: AutoGroupOption[];
  selectedGroupId: string | null;
  variant?: "sidebar" | "mobile";
}) {
  const [pending, startTransition] = useTransition();

  if (groups.length === 0) {
    return (
      <p className="px-3 text-[10px] text-[var(--da-muted)]">No auto groups available.</p>
    );
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--da-line)] bg-[var(--da-panel-2)] px-2.5 py-2 text-xs text-[var(--da-text)] outline-none focus:border-[var(--da-blue)] disabled:opacity-60";

  return (
    <div className={variant === "sidebar" ? "space-y-1.5 px-3 pb-2" : "space-y-1.5 px-3 pb-3"}>
      <label
        htmlFor={variant === "sidebar" ? "auto-group-switcher" : "auto-group-switcher-mobile"}
        className="block text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--da-muted)]"
      >
        Auto group
      </label>
      <select
        id={variant === "sidebar" ? "auto-group-switcher" : "auto-group-switcher-mobile"}
        name="dealer_group_id"
        value={selectedGroupId ?? ""}
        disabled={pending}
        className={selectClass}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          const fd = new FormData();
          fd.set("dealer_group_id", value);
          startTransition(() => {
            void setSelectedDealerGroupAction(fd);
          });
        }}
      >
        {!selectedGroupId ? (
          <option value="" disabled>
            Select an auto group…
          </option>
        ) : null}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
