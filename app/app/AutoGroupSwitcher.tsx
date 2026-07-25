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
      <p
        className={
          variant === "sidebar"
            ? "px-3 text-[10px] text-blue-200/60"
            : "px-3 text-xs text-slate-500"
        }
      >
        No auto groups available.
      </p>
    );
  }

  const selectClass =
    variant === "sidebar"
      ? "w-full rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-xs text-white outline-none focus:border-blue-400/60 disabled:opacity-60"
      : "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 disabled:opacity-60";

  return (
    <div className={variant === "sidebar" ? "space-y-1.5 px-3 pb-2" : "space-y-1.5 px-3 pb-3"}>
      <label
        htmlFor={variant === "sidebar" ? "auto-group-switcher" : "auto-group-switcher-mobile"}
        className={
          variant === "sidebar"
            ? "block text-[10px] font-medium uppercase tracking-[0.15em] text-blue-200/70"
            : "block text-xs font-medium text-slate-600"
        }
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
          <option key={g.id} value={g.id} className="text-slate-900">
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
