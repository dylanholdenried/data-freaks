"use client";

import { IC } from "@/lib/inventory-command/midmo";
import { shortStoreLabel } from "@/lib/acquire/store-labels";

export default function AcquireStorePills({
  stores,
  selectedIds,
  onChange,
}: {
  stores: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const allSelected = selectedIds.length === stores.length && stores.length > 0;

  function toggle(id: string) {
    const set = new Set(selectedIds);
    if (set.has(id)) {
      if (set.size <= 1) return; // keep at least one store selected
      set.delete(id);
    } else {
      set.add(id);
    }
    onChange(Array.from(set));
  }

  function selectAll() {
    onChange(stores.map((s) => s.id));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Stores">
      <button
        type="button"
        onClick={selectAll}
        className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{
          background: allSelected ? IC.blue : IC.rowAlt,
          color: allSelected ? "#fff" : IC.muted,
          border: `1px solid ${allSelected ? IC.blue : IC.border}`,
        }}
      >
        All stores
      </button>
      {stores.map((store) => {
        const active = selectedIds.includes(store.id);
        return (
          <button
            key={store.id}
            type="button"
            onClick={() => toggle(store.id)}
            aria-pressed={active}
            title={store.name}
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: active ? IC.blue : IC.rowAlt,
              color: active ? "#fff" : IC.muted,
              border: `1px solid ${active ? IC.blue : IC.border}`,
            }}
          >
            {shortStoreLabel(store.name)}
          </button>
        );
      })}
    </div>
  );
}
