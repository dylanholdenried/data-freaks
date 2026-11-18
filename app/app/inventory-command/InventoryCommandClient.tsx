"use client";

import { useMemo, useState } from "react";
import {
  daysUntilFirstOfNextMonth,
  hotAgeThreshold,
  isHotUnit,
  nonWholesaleUnits,
  wholesaleUnits,
} from "@/lib/inventory-command/compute";
import { collectDhUnitsForStore } from "@/lib/inventory-command/dh-purchases";
import type { DhPurchaseOverlay } from "@/lib/inventory-command/dh-purchases";
import { fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import {
  formatExportDate,
  IC,
  storeAccent,
  storeShortLabel,
} from "@/lib/inventory-command/midmo";
import { manualTagMap, resolveAcqSource } from "@/lib/inventory-command/acq-source";
import type { InventoryCommandTab } from "@/lib/inventory-command/types";
import type { InvDailyMetrics, InvUnitDetailRow } from "@/lib/inventory-command/types";
import type { InvMovement, InvPriceAction } from "@/lib/inventory-command/types";
import OverviewTab from "./tabs/OverviewTab";
import InventoryTab, { type InventoryTabData } from "./tabs/InventoryTab";
import DhPurchasesTab from "./tabs/DhPurchasesTab";
import TrendsTab from "./tabs/TrendsTab";
import HotListTab from "./tabs/HotListTab";
import MerchandisingTab from "./tabs/MerchandisingTab";
import PricingTab from "./tabs/PricingTab";
import DemandTab from "./tabs/DemandTab";
import MixTab from "./tabs/MixTab";
import SubprimeTab from "./tabs/SubprimeTab";
import WholesaleTab from "./tabs/WholesaleTab";
import WriteDown2026Tab from "./tabs/WriteDown2026Tab";
import { IcEmpty, IcFooterNote, IcRoot } from "./ui/primitives";
import { isJimButlerStore } from "@/lib/inventory-command/write-down";
import type { WriteDownBbManual, WriteDownCohortRow } from "@/lib/inventory-command/types";

export type StoreOption = { id: string; name: string };

export type InventoryCommandClientProps = {
  stores: StoreOption[];
  initialStoreId: string;
  snapshotDate: string | null;
  units: InvUnitDetailRow[];
  metrics: InvDailyMetrics | null;
  metricsHistory: InvDailyMetrics[];
  movements: InvMovement[];
  priceActions: InvPriceAction[];
  latestByStore: Record<string, string | null>;
  dhPurchases?: DhPurchaseOverlay[];
  inventoryTab: InventoryTabData;
  writeDownSold?: WriteDownCohortRow[];
  writeDownManuals?: WriteDownBbManual[];
  canEditWriteDownBb?: boolean;
};

const BASE_TABS: { id: InventoryCommandTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Inventory" },
  { id: "dh", label: "DH Purchases" },
  { id: "trends", label: "Trends" },
  { id: "hot", label: "Hot List" },
  { id: "merchandising", label: "Merchandising" },
  { id: "pricing", label: "Pricing" },
  { id: "demand", label: "Demand" },
  { id: "mix", label: "Mix" },
  { id: "subprime", label: "Subprime" },
  { id: "wholesale", label: "Wholesale" },
];

export default function InventoryCommandClient({
  stores,
  initialStoreId,
  snapshotDate,
  units,
  metricsHistory,
  movements,
  priceActions,
  latestByStore,
  dhPurchases = [],
  inventoryTab,
  writeDownSold = [],
  writeDownManuals = [],
  canEditWriteDownBb = false,
}: InventoryCommandClientProps) {
  const [storeId, setStoreId] = useState(initialStoreId);
  const [tab, setTab] = useState<InventoryCommandTab>("overview");

  function onStoreChange(nextId: string) {
    setStoreId(nextId);
    const url = new URL(window.location.href);
    url.searchParams.set("store", nextId);
    window.location.assign(url.toString());
  }

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";
  const showWriteDown = isJimButlerStore(storeName);
  const tabs = useMemo(
    () =>
      showWriteDown
        ? [...BASE_TABS, { id: "write_down_2026" as const, label: "2026 Write Down" }]
        : BASE_TABS,
    [showWriteDown]
  );
  const asOf = snapshotDate ?? latestByStore[storeId] ?? null;

  /** Prime + subprime only — wholesale never mixes into command tabs. */
  const operatingUnits = useMemo(() => nonWholesaleUnits(units), [units]);
  const wholesaleOnly = useMemo(() => wholesaleUnits(units), [units]);

  const hotCount = useMemo(() => {
    if (!snapshotDate) return 0;
    return operatingUnits.filter((u) => isHotUnit(u.age, snapshotDate)).length;
  }, [operatingUnits, snapshotDate]);

  const dhCount = useMemo(
    () => collectDhUnitsForStore(operatingUnits, storeId, storeName, dhPurchases).length,
    [operatingUnits, storeId, storeName, dhPurchases]
  );

  const untaggedCount = useMemo(() => {
    const manual = manualTagMap(inventoryTab.tags);
    return operatingUnits.filter(
      (u) => !resolveAcqSource(u.stk, manual, inventoryTab.sourceNames).source
    ).length;
  }, [operatingUnits, inventoryTab.tags, inventoryTab.sourceNames]);

  const totalCost = useMemo(
    () => operatingUnits.reduce((s, u) => s + (u.cost || 0), 0),
    [operatingUnits]
  );

  const threshold = snapshotDate ? hotAgeThreshold(snapshotDate) : null;
  const daysToFirst = snapshotDate ? daysUntilFirstOfNextMonth(snapshotDate) : null;

  return (
    <IcRoot>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div
            style={{
              color: IC.yellow,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            MidMO Inventory Command
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              lineHeight: 1.15,
              marginTop: 2,
              color: IC.text,
            }}
          >
            {storeName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: IC.muted }}>
            {asOf
              ? `vAuto export ${formatExportDate(asOf)} · ${fmtNum(operatingUnits.length)} units · ${fmtMoneyCompact(totalCost)} at cost${
                  wholesaleOnly.length > 0
                    ? ` · ${fmtNum(wholesaleOnly.length)} wholesale`
                    : ""
                }`
              : "No snapshot yet"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {stores.map((s) => {
            const active = storeId === s.id;
            const pillAccent = storeAccent(s.name);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onStoreChange(s.id)}
                style={{
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  cursor: "pointer",
                  border: active ? `1px solid ${pillAccent}` : `1px solid ${IC.border}`,
                  background: active ? pillAccent : "transparent",
                  color: active ? IC.darkText : IC.text,
                }}
              >
                {storeShortLabel(s.name)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = tab === t.id;
          const label =
            t.id === "hot"
              ? `Hot List (${hotCount})`
              : t.id === "dh"
                ? `DH Purchases (${dhCount})`
                : t.id === "inventory" && untaggedCount > 0
                  ? `Inventory (${untaggedCount} untagged)`
                  : t.id === "wholesale" && wholesaleOnly.length > 0
                    ? `Wholesale (${wholesaleOnly.length})`
                    : t.label;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                cursor: "pointer",
                border: active ? "1px solid #fff" : `1px solid ${IC.border}`,
                background: active ? "#fff" : IC.panel,
                color: active ? IC.darkText : IC.text,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        {!snapshotDate && units.length === 0 ? (
          <IcEmpty>
            No inventory snapshot for this store yet. A platform admin can upload the daily
            vAuto Merchandising export from Inventory upload.
          </IcEmpty>
        ) : (
          <>
            {tab === "overview" ? (
              <OverviewTab units={operatingUnits} snapshotDate={snapshotDate} />
            ) : null}
            {tab === "inventory" && snapshotDate ? (
              <InventoryTab
                units={operatingUnits}
                storeId={storeId}
                storeName={storeName}
                storeCount={stores.length}
                snapshotDate={snapshotDate}
                data={inventoryTab}
              />
            ) : null}
            {tab === "dh" ? (
              <DhPurchasesTab
                units={operatingUnits}
                storeId={storeId}
                storeName={storeName}
                purchases={dhPurchases}
              />
            ) : null}
            {tab === "trends" ? (
              <TrendsTab
                history={metricsHistory}
                units={operatingUnits}
                movements={movements}
                priceActions={priceActions}
                snapshotDate={snapshotDate}
              />
            ) : null}
            {tab === "hot" ? (
              <HotListTab units={operatingUnits} snapshotDate={snapshotDate} />
            ) : null}
            {tab === "merchandising" ? (
              <MerchandisingTab units={operatingUnits} />
            ) : null}
            {tab === "pricing" ? <PricingTab units={operatingUnits} /> : null}
            {tab === "demand" ? <DemandTab units={operatingUnits} /> : null}
            {tab === "mix" ? <MixTab units={operatingUnits} /> : null}
            {tab === "subprime" ? <SubprimeTab units={operatingUnits} /> : null}
            {tab === "wholesale" ? <WholesaleTab units={units} /> : null}
            {tab === "write_down_2026" && showWriteDown ? (
              <WriteDown2026Tab
                storeId={storeId}
                units={units}
                snapshotDate={snapshotDate}
                soldCohort={writeDownSold}
                manuals={writeDownManuals}
                canEdit={canEditWriteDownBb}
              />
            ) : null}
          </>
        )}
      </div>

      <IcFooterNote threshold={threshold} daysToFirst={daysToFirst} />
    </IcRoot>
  );
}
