"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { InventoryCommandTab } from "@/lib/inventory-command/types";
import type { InvDailyMetrics, InvUnitRow } from "@/lib/inventory-command/types";
import type { InvMovement, InvPriceAction } from "@/lib/inventory-command/types";
import OverviewTab from "./tabs/OverviewTab";
import TrendsTab from "./tabs/TrendsTab";
import HotListTab from "./tabs/HotListTab";
import MerchandisingTab from "./tabs/MerchandisingTab";
import PricingTab from "./tabs/PricingTab";
import DemandTab from "./tabs/DemandTab";
import MixTab from "./tabs/MixTab";
import SubprimeTab from "./tabs/SubprimeTab";

export type StoreOption = { id: string; name: string };

export type InventoryCommandClientProps = {
  stores: StoreOption[];
  initialStoreId: string;
  snapshotDate: string | null;
  units: InvUnitRow[];
  metrics: InvDailyMetrics | null;
  metricsHistory: InvDailyMetrics[];
  movements: InvMovement[];
  priceActions: InvPriceAction[];
  /** Per-store latest snapshot date for the switcher label */
  latestByStore: Record<string, string | null>;
};

const TABS: { id: InventoryCommandTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "hot", label: "Hot List" },
  { id: "merchandising", label: "Merchandising" },
  { id: "pricing", label: "Pricing" },
  { id: "demand", label: "Demand" },
  { id: "mix", label: "Mix" },
  { id: "subprime", label: "Subprime" },
];

export default function InventoryCommandClient({
  stores,
  initialStoreId,
  snapshotDate,
  units,
  metrics,
  metricsHistory,
  movements,
  priceActions,
  latestByStore,
}: InventoryCommandClientProps) {
  const [storeId, setStoreId] = useState(initialStoreId);
  const [tab, setTab] = useState<InventoryCommandTab>("overview");

  // When store changes via pills we navigate via query to reload RSC data
  function onStoreChange(nextId: string) {
    setStoreId(nextId);
    const url = new URL(window.location.href);
    url.searchParams.set("store", nextId);
    window.location.assign(url.toString());
  }

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";
  const asOf = snapshotDate ?? latestByStore[storeId] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inventory Command</h1>
          <p className="text-sm text-slate-500">
            {storeName}
            {asOf ? ` · as of ${asOf}` : " · no snapshot yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStoreChange(s.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                storeId === s.id
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px rounded-t-lg border border-b-0 px-3 py-2 text-xs font-medium transition-colors",
              tab === t.id
                ? "border-slate-200 bg-white text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {!snapshotDate && units.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No inventory snapshot for this store yet. A platform admin can upload the daily
            vAuto Merchandising export from Inventory upload.
          </p>
        ) : null}

        {tab === "overview" ? (
          <OverviewTab metrics={metrics} units={units} movements={movements} />
        ) : null}
        {tab === "trends" ? <TrendsTab history={metricsHistory} /> : null}
        {tab === "hot" ? <HotListTab units={units} snapshotDate={snapshotDate} /> : null}
        {tab === "merchandising" ? <MerchandisingTab units={units} /> : null}
        {tab === "pricing" ? <PricingTab units={units} /> : null}
        {tab === "demand" ? <DemandTab units={units} /> : null}
        {tab === "mix" ? <MixTab units={units} /> : null}
        {tab === "subprime" ? <SubprimeTab units={units} /> : null}

        {/* Keep priceActions available for future Pricing history panel */}
        {tab === "pricing" && priceActions.length > 0 ? (
          <p className="mt-4 text-xs text-slate-400">
            {priceActions.length} price action{priceActions.length === 1 ? "" : "s"} on{" "}
            {snapshotDate}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
