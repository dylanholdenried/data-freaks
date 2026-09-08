"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IcKpi,
  IcPanel,
  IcRoot,
  icDisplay,
  icSans,
} from "@/app/app/inventory-command/ui/primitives";
import { IC } from "@/lib/inventory-command/midmo";
import {
  ACQ_ACTIVE_STAGES,
  ACQ_COMPLETED_STAGES,
  ACQ_STAGE_LABELS,
  isCompletedStage,
  type AcqBuyer,
  type AcqPurchase,
  type AcqPurchaseStage,
} from "@/lib/acquire/types";
import { effectiveGross, formatMoney } from "@/lib/acquire/cost";
import { storesQueryString } from "@/lib/acquire/store-labels";
import AcquireStorePills from "../AcquireStorePills";
import PurchaseCard, { type CardOriginRect } from "./PurchaseCard";
import PurchaseFlipOverlay from "./PurchaseFlipOverlay";
import AddPurchaseModal from "./AddPurchaseModal";

export default function PurchasesClient({
  stores,
  buyers,
  initialStoreIds,
  purchases,
  canEdit,
}: {
  stores: { id: string; name: string }[];
  buyers: AcqBuyer[];
  initialStoreIds: string[];
  purchases: AcqPurchase[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const allIds = stores.map((s) => s.id);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    initialStoreIds.length ? initialStoreIds : allIds
  );
  const [stageFilter, setStageFilter] = useState<AcqPurchaseStage | "active" | "all">("active");
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flipOrigin, setFlipOrigin] = useState<CardOriginRect | null>(null);
  const [adding, setAdding] = useState(false);

  const storeNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of stores) m[s.id] = s.name;
    return m;
  }, [stores]);

  const storePurchases = useMemo(() => {
    const allowed = new Set(selectedStoreIds);
    return purchases.filter((p) => allowed.has(p.store_id));
  }, [purchases, selectedStoreIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return storePurchases.filter((p) => {
      const completed = isCompletedStage(p.stage);
      if (stageFilter === "active") {
        if (completed) return false;
      } else if (stageFilter === "all") {
        if (!showCompleted && completed) return false;
      } else if (p.stage !== stageFilter) {
        return false;
      }

      if (!q) return true;
      const hay = [
        p.stock_number,
        p.vin,
        p.vehicle_year,
        p.vehicle_make,
        p.vehicle_model,
        p.seller_name,
        p.auction_house,
        p.exit_strategy,
        storeNameById[p.store_id],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [storePurchases, stageFilter, showCompleted, query, storeNameById]);

  const selected = selectedId
    ? storePurchases.find((p) => p.id === selectedId) ?? null
    : null;

  const pipelineCounts = ACQ_ACTIVE_STAGES.map((stage) => ({
    stage,
    count: storePurchases.filter((p) => p.stage === stage).length,
  }));
  const completedCounts = ACQ_COMPLETED_STAGES.map((stage) => ({
    stage,
    count: storePurchases.filter((p) => p.stage === stage).length,
  }));
  const stageCounts = [...pipelineCounts, ...completedCounts];

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const soldMonth = storePurchases.filter(
    (p) => p.stage === "sold" && (p.sold_date ?? "").startsWith(monthPrefix)
  );
  const monthGrosses = soldMonth
    .map((p) => effectiveGross(p))
    .filter((g): g is number => g != null);
  const avgGross =
    monthGrosses.length === 0
      ? null
      : monthGrosses.reduce((sum, g) => sum + g, 0) / monthGrosses.length;

  function onStoresChange(next: string[]) {
    setSelectedStoreIds(next);
    setSelectedId(null);
    const qs = storesQueryString(next, allIds);
    router.replace(qs ? `/app/acquire/purchases?${qs}` : "/app/acquire/purchases");
  }

  const defaultCreateStoreId = selectedStoreIds[0] ?? allIds[0] ?? "";

  return (
    <IcRoot className={`${icSans.variable} ${icDisplay.variable}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: IC.muted }}
          >
            Acquire
          </p>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{
              fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
              color: IC.text,
            }}
          >
            Purchases
          </h1>
          <p className="mt-1 text-sm" style={{ color: IC.muted }}>
            External purchase cars — collection pipeline, separate from trades and DH Purchases.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md px-3 py-2 text-xs font-semibold text-white"
            style={{ background: IC.blue }}
          >
            + Log purchase
          </button>
        ) : null}
      </div>

      <div className="mb-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: IC.muted }}>
          Stores
        </p>
        <AcquireStorePills
          stores={stores}
          selectedIds={selectedStoreIds}
          onChange={onStoresChange}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {stageCounts.map(({ stage, count }) => (
          <IcKpi key={stage} label={ACQ_STAGE_LABELS[stage]} value={count} />
        ))}
        <IcKpi label="Sold this month" value={soldMonth.length} status="ok" />
        <IcKpi
          label="Avg gross (mo)"
          value={avgGross != null && Number.isFinite(avgGross) ? formatMoney(avgGross) : "—"}
        />
      </div>

      <IcPanel title="Collection" note={`${filtered.length} cards`}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStageFilter("active")}
            className="rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              background: stageFilter === "active" ? IC.blue : IC.rowAlt,
              color: stageFilter === "active" ? "#fff" : IC.muted,
            }}
          >
            Active
          </button>
          {ACQ_ACTIVE_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setStageFilter(stage)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: stageFilter === stage ? IC.blue : IC.rowAlt,
                color: stageFilter === stage ? "#fff" : IC.muted,
              }}
            >
              {ACQ_STAGE_LABELS[stage]}
            </button>
          ))}
          {ACQ_COMPLETED_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => {
                setShowCompleted(true);
                setStageFilter(stage);
              }}
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: stageFilter === stage ? IC.blue : IC.rowAlt,
                color: stageFilter === stage ? "#fff" : IC.muted,
                border: `1px solid ${IC.border}`,
              }}
            >
              {ACQ_STAGE_LABELS[stage]}
              {completedCounts.find((c) => c.stage === stage)?.count
                ? ` (${completedCounts.find((c) => c.stage === stage)!.count})`
                : ""}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: IC.muted }}>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => {
                setShowCompleted(e.target.checked);
                if (e.target.checked) setStageFilter("all");
                else setStageFilter("active");
              }}
            />
            Show sold / arb complete in Active mix
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock, VIN, YMM…"
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ background: "#0f141c", borderColor: IC.border, color: IC.text, minWidth: 180 }}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: IC.muted }}>
            No purchase cars in this view. {canEdit ? "Log a purchase to start the collection." : null}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((p) => (
              <PurchaseCard
                key={p.id}
                purchase={p}
                storeName={storeNameById[p.store_id] ?? "Store"}
                canEdit={canEdit}
                hidden={selectedId === p.id}
                onOpen={(origin) => {
                  setFlipOrigin(origin);
                  setSelectedId(p.id);
                }}
              />
            ))}
          </div>
        )}
      </IcPanel>

      {selected && flipOrigin ? (
        <PurchaseFlipOverlay
          key={selected.id}
          purchase={selected}
          storeName={storeNameById[selected.store_id] ?? "Store"}
          buyers={buyers}
          canEdit={canEdit}
          origin={flipOrigin}
          onClose={() => {
            setSelectedId(null);
            setFlipOrigin(null);
          }}
        />
      ) : null}

      {adding ? (
        <AddPurchaseModal
          stores={stores}
          buyers={buyers}
          defaultStoreId={defaultCreateStoreId}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </IcRoot>
  );
}
