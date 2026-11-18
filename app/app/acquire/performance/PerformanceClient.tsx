"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AcqPurchase } from "@/lib/acquire/types";
import { storesQueryString, shortStoreLabel } from "@/lib/acquire/store-labels";
import {
  ACQUIRE_PERF_TABS,
  acquireModelCohortHref,
  buildOverview,
  filterSoldInRange,
  makeModelFromBuyBoxRow,
  parseAcquirePerfTab,
  rollupByModel,
  rollupBySourceTree,
  toBuyBoxRollupRow,
  type AcquirePerfTabId,
} from "@/lib/acquire/performance-analytics";
import {
  DATE_PRESET_OPTIONS,
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import {
  scoreBuyBox,
  type BuyBoxSettings,
} from "@/lib/profit-center/buyBox";
import { fmt$ } from "@/app/app/profit-center/format";
import OverviewTab from "./tabs/OverviewTab";
import BuyBoxTab from "./tabs/BuyBoxTab";
import SourcesTab from "./tabs/SourcesTab";
import PurchasesTab from "./tabs/PurchasesTab";

function buildHref(opts: {
  storeIds: string[];
  allIds: string[];
  preset: DatePreset;
  tab: AcquirePerfTabId;
}): string {
  const parts: string[] = [];
  const storesQs = storesQueryString(opts.storeIds, opts.allIds);
  if (storesQs) parts.push(storesQs);
  if (opts.preset !== "mtd") parts.push(`preset=${opts.preset}`);
  if (opts.tab !== "overview") parts.push(`tab=${opts.tab}`);
  return parts.length
    ? `/app/acquire/performance?${parts.join("&")}`
    : "/app/acquire/performance";
}

export default function PerformanceClient({
  stores,
  initialStoreIds,
  purchases,
  buyers,
  buyBoxSettings,
  initialPreset,
  initialTab,
}: {
  stores: { id: string; name: string }[];
  initialStoreIds: string[];
  purchases: AcqPurchase[];
  buyers: { id: string; name: string }[];
  buyBoxSettings: BuyBoxSettings;
  initialPreset: DatePreset;
  initialTab: AcquirePerfTabId;
}) {
  const router = useRouter();
  const allIds = stores.map((s) => s.id);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    initialStoreIds.length ? initialStoreIds : allIds
  );
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [tab, setTab] = useState<AcquirePerfTabId>(
    parseAcquirePerfTab(initialTab)
  );
  const [minVolume, setMinVolume] = useState(buyBoxSettings.minVolume);

  const range: DateRange = useMemo(() => resolveDateRange(preset), [preset]);

  const storeScoped = useMemo(() => {
    const allowed = new Set(selectedStoreIds);
    return purchases.filter(
      (p) => p.store_id == null || allowed.has(p.store_id)
    );
  }, [purchases, selectedStoreIds]);

  const soldInRange = useMemo(
    () => filterSoldInRange(storeScoped, range),
    [storeScoped, range]
  );

  const overview = useMemo(() => buildOverview(soldInRange), [soldInRange]);
  const modelRows = useMemo(() => rollupByModel(soldInRange), [soldInRange]);
  const sourceRows = useMemo(
    () => rollupBySourceTree(soldInRange),
    [soldInRange]
  );

  const buyBox = useMemo(() => {
    const rollups = modelRows.map(toBuyBoxRollupRow);
    return scoreBuyBox(rollups, { ...buyBoxSettings, minVolume });
  }, [modelRows, buyBoxSettings, minVolume]);

  function modelHrefFromRow(row: { key: string; label: string }) {
    const { make, model } = makeModelFromBuyBoxRow(row, modelRows);
    return acquireModelCohortHref(make, model, {
      preset,
      storeIds: selectedStoreIds,
      allStoreIds: allIds,
    });
  }

  const retailTotal = overview.retail.total;

  function navigate(next: {
    storeIds?: string[];
    preset?: DatePreset;
    tab?: AcquirePerfTabId;
  }) {
    const href = buildHref({
      storeIds: next.storeIds ?? selectedStoreIds,
      allIds,
      preset: next.preset ?? preset,
      tab: next.tab ?? tab,
    });
    router.replace(href);
  }

  function onStoresChange(next: string[]) {
    setSelectedStoreIds(next);
    navigate({ storeIds: next });
  }

  function toggleStore(id: string) {
    const set = new Set(selectedStoreIds);
    if (set.has(id)) {
      if (set.size <= 1) return;
      set.delete(id);
    } else {
      set.add(id);
    }
    onStoresChange(Array.from(set));
  }

  function selectAllStores() {
    onStoresChange(allIds);
  }

  function onPresetChange(next: DatePreset) {
    setPreset(next);
    navigate({ preset: next });
  }

  function onTabChange(next: AcquirePerfTabId) {
    setTab(next);
    navigate({ tab: next });
  }

  const allStoresSelected =
    selectedStoreIds.length === allIds.length && allIds.length > 0;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquire</p>
          <h1 className="pc-title">Performance</h1>
          <p className="pc-meta">
            {tab === "purchases"
              ? "All-time purchase rows · date preset ignored"
              : range.from === "2000-01-01"
                ? "All time"
                : `${range.from} → ${range.to}`}
            {tab !== "purchases" ? (
              <>
                {" · "}
                {soldInRange.length.toLocaleString()} sold
                {" · "}
                {fmt$(retailTotal)} retail total gross
              </>
            ) : (
              <>
                {" · "}
                {storeScoped.length.toLocaleString()} purchase
                {storeScoped.length === 1 ? "" : "s"}
              </>
            )}
          </p>
          <p className="pc-meta">
            Purchase-card economics only. Retail averages exclude wholesale;
            wholesale is broken out separately.
          </p>
        </div>
        {stores.length > 0 ? (
          <div className="pc-store-pills" role="group" aria-label="Stores">
            <button
              type="button"
              className={cn("pc-pill", allStoresSelected && "is-active")}
              onClick={selectAllStores}
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "pc-pill",
                  selectedStoreIds.includes(s.id) && "is-active"
                )}
                onClick={() => toggleStore(s.id)}
                title={s.name}
              >
                {shortStoreLabel(s.name)}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">Date range</p>
        <div className="pc-pill-row">
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPresetChange(opt.value)}
              className={cn(
                "pc-pill is-soft",
                preset === opt.value && "is-active"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <div className="pc-tabs" role="tablist">
        {ACQUIRE_PERF_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={cn("pc-tab", tab === t.id && "is-active")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab
          overview={overview}
          buyBox={buyBox}
          minVolume={minVolume}
          purchases={storeScoped}
          onOpenBuyBox={() => onTabChange("buy-box")}
          onOpenSources={() => onTabChange("sources")}
        />
      ) : null}
      {tab === "buy-box" ? (
        <BuyBoxTab
          buyBox={buyBox}
          groupDefaultMin={buyBoxSettings.minVolume}
          minVolume={minVolume}
          onMinVolumeChange={setMinVolume}
          settings={{ ...buyBoxSettings, minVolume }}
          modelHrefFromRow={modelHrefFromRow}
        />
      ) : null}
      {tab === "sources" ? <SourcesTab rows={sourceRows} /> : null}
      {tab === "purchases" ? (
        <PurchasesTab
          purchases={storeScoped}
          stores={stores}
          buyers={buyers}
        />
      ) : null}
    </div>
  );
}
