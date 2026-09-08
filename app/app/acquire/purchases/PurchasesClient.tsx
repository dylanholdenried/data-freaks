"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  isActiveStage,
  isCompletedStage,
  type AcqBuyer,
  type AcqPurchase,
  type AcqPurchaseStage,
} from "@/lib/acquire/types";
import {
  allInCost,
  effectiveGross,
  formatMoney,
  headerAgeDays,
  num,
} from "@/lib/acquire/cost";
import { countAcquireActionItems } from "@/lib/acquire/action-items";
import { storesQueryString } from "@/lib/acquire/store-labels";
import AcquireStorePills from "../AcquireStorePills";
import PurchaseCard, { type CardOriginRect } from "./PurchaseCard";
import PurchaseFlipOverlay from "./PurchaseFlipOverlay";
import AddPurchaseModal from "./AddPurchaseModal";
import BulkUploadModal from "./BulkUploadModal";
import type { VehicleCatalogMake, VehicleCatalogModel } from "./AcquireVehicleFields";
import { Search, X } from "lucide-react";

export default function PurchasesClient({
  stores,
  buyers,
  vehicleMakes,
  vehicleModels,
  initialStoreIds,
  purchases,
  canEdit,
}: {
  stores: { id: string; name: string }[];
  buyers: AcqBuyer[];
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  initialStoreIds: string[];
  purchases: AcqPurchase[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const allIds = stores.map((s) => s.id);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    initialStoreIds.length ? initialStoreIds : allIds
  );
  const [pill, setPill] = useState<AcqPurchaseStage | "on_hold">("frontline");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flipOrigin, setFlipOrigin] = useState<CardOriginRect | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  /** Optimistic + post-save list until server props catch up. */
  const [localPurchases, setLocalPurchases] = useState(purchases);
  const refreshAfterCloseRef = useRef(false);
  const pendingBucketRef = useRef<AcqPurchaseStage | null>(null);

  useEffect(() => {
    setLocalPurchases(purchases);
  }, [purchases]);

  const storeNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of stores) m[s.id] = s.name;
    return m;
  }, [stores]);

  const storePurchases = useMemo(() => {
    const allowed = new Set(selectedStoreIds);
    // Unassigned cars stay visible until a destination store is set.
    return localPurchases.filter((p) => p.store_id == null || allowed.has(p.store_id));
  }, [localPurchases, selectedStoreIds]);

  function applyPurchaseUpdate(updated: AcqPurchase, opts?: { switchBucketNow?: boolean }) {
    setLocalPurchases((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    if (opts?.switchBucketNow !== false) {
      setPill(updated.stage);
    }
  }

  function handleDetailSaved(updated: AcqPurchase) {
    // Keep current bucket until flip closes, then jump to the new stage.
    applyPurchaseUpdate(updated, { switchBucketNow: false });
    pendingBucketRef.current = updated.stage;
    refreshAfterCloseRef.current = true;
  }

  function handleOverlayClose() {
    setSelectedId(null);
    setFlipOrigin(null);
    if (pendingBucketRef.current) {
      setPill(pendingBucketRef.current);
      pendingBucketRef.current = null;
    }
    if (refreshAfterCloseRef.current) {
      refreshAfterCloseRef.current = false;
      router.refresh();
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = storePurchases.filter((p) => {
      if (pill === "on_hold") {
        if (!p.on_hold) return false;
      } else if (p.stage !== pill) {
        return false;
      }

      if (!q) return true;
      const hay = [
        p.stock_number,
        p.vin,
        p.vehicle_year,
        p.vehicle_make,
        p.vehicle_model,
        p.vehicle_trim,
      ]
        .filter((v) => v != null && String(v).trim() !== "")
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    // Default: longest time in current step first
    return list.sort((a, b) => (b.days_in_step ?? -1) - (a.days_in_step ?? -1));
  }, [storePurchases, pill, query]);

  const selected = selectedId
    ? storePurchases.find((p) => p.id === selectedId) ?? null
    : null;

  const stageCounts = ACQ_STAGES.map((stage) => ({
    stage,
    count: storePurchases.filter((p) => p.stage === stage).length,
  }));
  const onHoldCount = storePurchases.filter((p) => p.on_hold).length;

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const activePurchases = storePurchases.filter((p) => isActiveStage(p.stage));

  function capitalOf(p: AcqPurchase): number | null {
    const allIn = allInCost(p);
    if (allIn != null) return allIn;
    if (p.purchase_price == null) return null;
    return num(p.purchase_price);
  }

  const activeCapital = activePurchases.reduce((sum, p) => sum + (capitalOf(p) ?? 0), 0);
  const hasActiveCapital = activePurchases.some((p) => capitalOf(p) != null);

  const AGING_DAYS = 45;
  const agingCars = activePurchases.filter((p) => {
    const age = headerAgeDays(p, now);
    return age != null && age >= AGING_DAYS;
  });
  const agingCapital = agingCars.reduce((sum, p) => sum + (capitalOf(p) ?? 0), 0);

  const soldMonth = storePurchases.filter(
    (p) => p.stage === "sold" && (p.sold_date ?? "").startsWith(monthPrefix)
  );
  const monthTotalGross = soldMonth.reduce((sum, p) => {
    const g = effectiveGross(p);
    return g != null ? sum + g : sum;
  }, 0);
  const hasMonthGross = soldMonth.some((p) => effectiveGross(p) != null);

  const openActionItems = activePurchases.reduce(
    (sum, p) => sum + countAcquireActionItems(p),
    0
  );

  const onHoldCars = storePurchases.filter((p) => p.on_hold);
  const onHoldCapital = onHoldCars.reduce((sum, p) => sum + (capitalOf(p) ?? 0), 0);
  const hasOnHoldCapital = onHoldCars.some((p) => capitalOf(p) != null);

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
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-md px-3 py-2 text-xs font-semibold text-white"
              style={{ background: IC.blue }}
            >
              + Log purchase
            </button>
            <button
              type="button"
              onClick={() => setBulkUploading(true)}
              className="rounded-md border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: IC.border, color: IC.text, background: IC.rowAlt }}
            >
              Bulk Upload
            </button>
          </div>
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <IcKpi
          label="Active capital"
          value={hasActiveCapital ? formatMoney(activeCapital) : "—"}
          sub={`${activePurchases.length} active`}
        />
        <IcKpi
          label={`Aging ${AGING_DAYS}+d`}
          value={agingCars.length}
          sub={agingCars.length ? formatMoney(agingCapital) : "No aged units"}
          status={agingCars.length > 0 ? "bad" : "ok"}
        />
        <IcKpi
          label="Month total gross"
          value={hasMonthGross ? formatMoney(monthTotalGross) : "—"}
          sub={`${soldMonth.length} sold`}
          status="ok"
        />
        <IcKpi
          label="Open action items"
          value={openActionItems}
          sub="Active pipeline"
          status={openActionItems > 0 ? "warn" : "ok"}
        />
        <IcKpi
          label="On Hold $"
          value={hasOnHoldCapital || onHoldCount > 0 ? formatMoney(onHoldCapital) : "—"}
          sub={`${onHoldCount} unit${onHoldCount === 1 ? "" : "s"}`}
          status={onHoldCount > 0 ? "warn" : undefined}
        />
      </div>

      <IcPanel title="Collection" note={`${filtered.length} cards`}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {ACQ_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setPill(stage)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: pill === stage ? IC.blue : IC.rowAlt,
                color: pill === stage ? "#fff" : IC.muted,
                border: isCompletedStage(stage) ? `1px solid ${IC.border}` : undefined,
              }}
            >
              {ACQ_STAGE_LABELS[stage]}
              {stageCounts.find((c) => c.stage === stage)?.count
                ? ` (${stageCounts.find((c) => c.stage === stage)!.count})`
                : ""}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPill("on_hold")}
            className="rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              background: pill === "on_hold" ? IC.orange : IC.rowAlt,
              color: pill === "on_hold" ? "#fff" : IC.muted,
              border: `1px solid ${pill === "on_hold" ? IC.orange : IC.border}`,
            }}
          >
            On Hold{onHoldCount ? ` (${onHoldCount})` : ""}
          </button>
        </div>

        <div className="mb-4">
          <label className="relative block">
            <span className="sr-only">Search purchases</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: IC.muted }}
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stock, VIN, year, make, model…"
              autoComplete="off"
              className="w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm"
              style={{ background: "#0f141c", borderColor: IC.border, color: IC.text }}
            />
            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/5"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" style={{ color: IC.muted }} />
              </button>
            ) : null}
          </label>
          {query.trim() ? (
            <p className="mt-1.5 text-[11px]" style={{ color: IC.muted }}>
              {filtered.length} match{filtered.length === 1 ? "" : "es"}
            </p>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: IC.muted }}>
            {query.trim()
              ? "No cars match that search in this view."
              : canEdit
                ? "No purchase cars in this view. Log a purchase to start the collection."
                : "No purchase cars in this view."}
          </p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((p) => (
              <PurchaseCard
                key={p.id}
                purchase={p}
                storeName={p.store_id ? storeNameById[p.store_id] ?? "Store" : "Unassigned"}
                canEdit={canEdit}
                hidden={selectedId === p.id}
                onOpen={(origin) => {
                  setFlipOrigin(origin);
                  setSelectedId(p.id);
                }}
                onPurchaseUpdated={(updated) => {
                  applyPurchaseUpdate(updated);
                  router.refresh();
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
          storeName={
            selected.store_id
              ? storeNameById[selected.store_id] ?? "Store"
              : "Unassigned"
          }
          stores={stores}
          buyers={buyers}
          vehicleMakes={vehicleMakes}
          vehicleModels={vehicleModels}
          canEdit={canEdit}
          origin={flipOrigin}
          onClose={handleOverlayClose}
          onSaved={handleDetailSaved}
        />
      ) : null}

      {adding ? (
        <AddPurchaseModal
          stores={stores}
          buyers={buyers}
          vehicleMakes={vehicleMakes}
          vehicleModels={vehicleModels}
          defaultStoreId={defaultCreateStoreId}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {bulkUploading ? (
        <BulkUploadModal
          storeNames={stores.map((s) => s.name)}
          onClose={() => setBulkUploading(false)}
        />
      ) : null}
    </IcRoot>
  );
}
