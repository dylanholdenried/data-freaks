"use client";

import { useMemo, useState } from "react";
import {
  daysUntilFirstOfNextMonth,
  hotAgeThreshold,
  isHotUnit,
} from "@/lib/inventory-command/compute";
import { collectDhUnitsForStore } from "@/lib/inventory-command/dh-purchases";
import { fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import {
  formatExportDate,
  IC,
  storeAccent,
  storeShortLabel,
} from "@/lib/inventory-command/midmo";
import type { InventoryCommandTab } from "@/lib/inventory-command/types";
import type { InvDailyMetrics, InvUnitRow } from "@/lib/inventory-command/types";
import type { InvMovement, InvPriceAction } from "@/lib/inventory-command/types";
import OverviewTab from "./tabs/OverviewTab";
import DhPurchasesTab from "./tabs/DhPurchasesTab";
import TrendsTab from "./tabs/TrendsTab";
import HotListTab from "./tabs/HotListTab";
import MerchandisingTab from "./tabs/MerchandisingTab";
import PricingTab from "./tabs/PricingTab";
import DemandTab from "./tabs/DemandTab";
import MixTab from "./tabs/MixTab";
import SubprimeTab from "./tabs/SubprimeTab";
import { IcEmpty, IcFooterNote, IcRoot } from "./ui/primitives";

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
  latestByStore: Record<string, string | null>;
};

const TABS: { id: InventoryCommandTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "dh", label: "DH Purchases" },
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
  metricsHistory,
  movements,
  priceActions,
  latestByStore,
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
  const asOf = snapshotDate ?? latestByStore[storeId] ?? null;

  const hotCount = useMemo(() => {
    if (!snapshotDate) return 0;
    return units.filter((u) => isHotUnit(u.age, snapshotDate)).length;
  }, [units, snapshotDate]);

  const dhCount = useMemo(
    () => collectDhUnitsForStore(units, storeId, storeName).length,
    [units, storeId, storeName]
  );

  const totalCost = useMemo(
    () => units.reduce((s, u) => s + (u.cost || 0), 0),
    [units]
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
              ? `vAuto export ${formatExportDate(asOf)} · ${fmtNum(units.length)} units · ${fmtMoneyCompact(totalCost)} at cost`
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
        {TABS.map((t) => {
          const active = tab === t.id;
          const label =
            t.id === "hot"
              ? `Hot List (${hotCount})`
              : t.id === "dh"
                ? `DH Purchases (${dhCount})`
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
              <OverviewTab units={units} snapshotDate={snapshotDate} />
            ) : null}
            {tab === "dh" ? (
              <DhPurchasesTab units={units} storeId={storeId} storeName={storeName} />
            ) : null}
            {tab === "trends" ? (
              <TrendsTab
                history={metricsHistory}
                units={units}
                movements={movements}
                priceActions={priceActions}
                snapshotDate={snapshotDate}
              />
            ) : null}
            {tab === "hot" ? (
              <HotListTab units={units} snapshotDate={snapshotDate} />
            ) : null}
            {tab === "merchandising" ? <MerchandisingTab units={units} /> : null}
            {tab === "pricing" ? <PricingTab units={units} /> : null}
            {tab === "demand" ? <DemandTab units={units} /> : null}
            {tab === "mix" ? <MixTab units={units} /> : null}
            {tab === "subprime" ? <SubprimeTab units={units} /> : null}
          </>
        )}
      </div>

      <IcFooterNote threshold={threshold} daysToFirst={daysToFirst} />
    </IcRoot>
  );
}
