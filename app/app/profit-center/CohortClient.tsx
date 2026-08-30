"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  aggregateByDimension,
  buildTradesByDeal,
  type Dimension,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitTrade,
} from "@/lib/profit-center/aggregate";
import { buildCohortRecommendations } from "@/lib/profit-center/cohortRecommendations";
import {
  compareHref,
  profitCenterHref,
  type CohortFocus,
} from "@/lib/profit-center/cohort";
import {
  pcFmt$,
  pcFmtMiles,
  pcFmtN,
  pcFmtPct,
} from "@/lib/profit-center/format";
import {
  inventoryBridgeCue,
  onLotInventoryHref,
  summarizeModelInventory,
  type InventoryBridgeSummary,
} from "@/lib/profit-center/inventoryBridge";
import type { BuyBoxSettings, ScoredModel } from "@/lib/profit-center/buyBox";
import type { DateRange } from "@/lib/profit-center/dateRange";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

type DealSortKey =
  | "stock"
  | "sale_date"
  | "year"
  | "trim"
  | "odometer"
  | "sale_price"
  | "front"
  | "back"
  | "total"
  | "age"
  | "trade";

function dealTotal(d: ProfitDeal): number | null {
  if (
    d.front_profit == null ||
    !Number.isFinite(d.front_profit) ||
    d.back_profit == null ||
    !Number.isFinite(d.back_profit)
  ) {
    return null;
  }
  return d.front_profit + d.back_profit;
}

function sortValue(
  d: ProfitDeal,
  key: DealSortKey,
  tradesByDeal: Map<string, ProfitTrade[]>
): string | number {
  switch (key) {
    case "stock":
      return d.stock_number?.trim() || "";
    case "sale_date":
      return d.sale_date;
    case "year":
      return d.vehicle_year ?? -Infinity;
    case "trim":
      return d.trim?.trim() || "";
    case "odometer":
      return d.odometer ?? -Infinity;
    case "sale_price":
      return d.sale_price ?? -Infinity;
    case "front":
      return d.front_profit ?? -Infinity;
    case "back":
      return d.back_profit ?? -Infinity;
    case "total":
      return dealTotal(d) ?? -Infinity;
    case "age":
      return d.age ?? -Infinity;
    case "trade":
      return (tradesByDeal.get(d.id) ?? []).length > 0 ? 1 : 0;
    default:
      return 0;
  }
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: DealSortKey;
  activeKey: DealSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: DealSortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={align === "right" ? "text-right" : undefined}>
      <button type="button" className="pc-sort" onClick={() => onSort(sortKey)}>
        {label}
        {activeKey === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

interface Props {
  title: string;
  focus: CohortFocus;
  make?: string;
  model?: string;
  value?: string;
  stores: Store[];
  departments: Department[];
  cohortDeals: ProfitDeal[];
  trades: ProfitTrade[];
  dealSalespeople: ProfitDealSalesperson[];
  buyBoxSettings: BuyBoxSettings;
  scored?: ScoredModel | null;
  signal: "buy" | "red" | "near" | null;
  preset: string;
  range: DateRange;
  storeId: string;
  departmentName: string;
  inventoryUnits: InvUnitRow[];
  inventorySnapshotDate: string | null;
}

export default function CohortClient({
  title,
  focus,
  make,
  model,
  value,
  stores,
  cohortDeals,
  trades,
  buyBoxSettings,
  signal,
  preset,
  range,
  storeId,
  departmentName,
  inventoryUnits,
  inventorySnapshotDate,
}: Props) {
  const [sortKey, setSortKey] = useState<DealSortKey>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);

  const ctx = useMemo(
    () => ({
      deals: cohortDeals,
      tradesByDeal,
      dealSalespeople: [] as ProfitDealSalesperson[],
      salespersonNames: new Map<string, string>(),
      departmentNames: new Map<string, string>(),
    }),
    [cohortDeals, tradesByDeal]
  );

  const kpi = useMemo(() => {
    return aggregateByDimension("model", ctx).total;
  }, [ctx]);

  const skipDims: Dimension[] =
    focus === "year"
      ? ["year"]
      : focus === "trim"
        ? ["trim"]
        : focus === "price"
          ? ["price"]
          : focus === "odometer"
            ? ["odometer"]
            : focus === "acquisition"
              ? ["acquisition"]
              : [];

  const recommendations = useMemo(
    () => buildCohortRecommendations(ctx, buyBoxSettings, skipDims),
    [ctx, buyBoxSettings, skipDims]
  );

  const inventory: InventoryBridgeSummary | null = useMemo(() => {
    if (focus !== "model" || !make || !model) return null;
    return summarizeModelInventory(
      inventoryUnits,
      make,
      model,
      inventorySnapshotDate
    );
  }, [focus, make, model, inventoryUnits, inventorySnapshotDate]);

  const invCue =
    inventory && (signal === "buy" || signal === "red")
      ? inventoryBridgeCue(inventory, signal === "buy")
      : inventory && inventory.count > 0
        ? inventoryBridgeCue(inventory, false)
        : null;

  const onLotHref =
    focus === "model" && make && model
      ? onLotInventoryHref({
          make,
          model,
          preset,
          storeId,
          departmentName,
        })
      : null;

  function toggleSort(key: DealSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "stock" || key === "trim" || key === "sale_date" ? "asc" : "desc"
      );
    }
  }

  const sortedDeals = useMemo(() => {
    const copy = [...cohortDeals];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey, tradesByDeal);
      const bv = sortValue(b, sortKey, tradesByDeal);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = typeof av === "number" ? av : -Infinity;
      const bn = typeof bv === "number" ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [cohortDeals, sortKey, sortDir, tradesByDeal]);

  const backHref = profitCenterHref({ preset, storeId, departmentName });
  const storeLabel =
    storeId === "all"
      ? "All stores"
      : stores.find((s) => s.id === storeId)?.name ?? "Store";

  const compareType =
    focus === "model" ? "model" : focus === "acquisition" ? "acquisition" : null;
  const compareA =
    focus === "model" && make && model
      ? `${make} ${model}`
      : focus === "acquisition"
        ? value
        : undefined;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">
            <Link href={backHref} className="pc-link">
              ← Profit Center
            </Link>
          </p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01"
              ? "All time"
              : `${range.from} → ${range.to}`}
            {" · "}
            {storeLabel}
            {departmentName !== "all" ? ` · ${departmentName}` : ""}
            {" · "}
            {cohortDeals.length} deal{cohortDeals.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="pc-pill-row">
          {compareType && compareA && (
            <Link
              href={compareHref({
                type: compareType,
                a: compareA,
                preset,
                storeId,
                departmentName,
              })}
              className="pc-pill is-soft"
            >
              Compare
            </Link>
          )}
        </div>
      </header>

      {signal && (
        <div className="pc-panel pc-signal-banner">
          {signal === "buy" && (
            <span className="pc-buybox-score buy">Buy more</span>
          )}
          {signal === "red" && (
            <span className="pc-buybox-score red">Red-light</span>
          )}
          {signal === "near" && (
            <span className="pc-buybox-score near">Near miss</span>
          )}
        </div>
      )}

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Volume</div>
          <div className="pc-kpi-value">{kpi.volume}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg front</div>
          <div className="pc-kpi-value">{pcFmt$(kpi.avgFront)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg back</div>
          <div className="pc-kpi-value">{pcFmt$(kpi.avgBack)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg total</div>
          <div className="pc-kpi-value green">{pcFmt$(kpi.avgTotal)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg turn</div>
          <div
            className={cn(
              "pc-kpi-value",
              kpi.avgAge != null && kpi.avgAge > 45 ? "red" : "amber"
            )}
          >
            {kpi.avgAge == null ? "—" : `${pcFmtN(kpi.avgAge, 0)}d`}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade %</div>
          <div className="pc-kpi-value">{pcFmtPct(kpi.tradePct)}</div>
        </div>
      </div>

      <section className="pc-panel pc-dial-in">
        <div className="pc-panel-label">What to stock / what to avoid</div>
        <p className="pc-dial-in-summary">{recommendations.combinedSummary}</p>
        <div className="pc-dial-in-list">
          {recommendations.dimensions.map((d) => (
            <div key={d.dimension} className="pc-dial-in-dim">
              <h3>{d.dimensionLabel}</h3>
              <p className="pc-dial-in-stock">{d.stockLine}</p>
              <p className="pc-dial-in-avoid">{d.avoidLine}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-panel">
        <div className="pc-chart-head">
          <div>
            <h3>Deals</h3>
            <p>Click stock # to open the deal. All columns sort high or low.</p>
          </div>
        </div>
        {sortedDeals.length === 0 ? (
          <p className="pc-empty">No closed deals in this cut.</p>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <SortHeader
                    label="Stock"
                    sortKey="stock"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Date"
                    sortKey="sale_date"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Year"
                    sortKey="year"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Trim"
                    sortKey="trim"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Odo"
                    sortKey="odometer"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Sale $"
                    sortKey="sale_price"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Front"
                    sortKey="front"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Back"
                    sortKey="back"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Total"
                    sortKey="total"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Turn"
                    sortKey="age"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Trade"
                    sortKey="trade"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDeals.map((d) => {
                  const hasTrade = (tradesByDeal.get(d.id) ?? []).length > 0;
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link
                          href={`/app/deals/${d.id}/edit`}
                          className="pc-link"
                        >
                          {d.stock_number || "Open"}
                        </Link>
                      </td>
                      <td>{d.sale_date}</td>
                      <td>{d.vehicle_year || "—"}</td>
                      <td>{d.trim?.trim() || "—"}</td>
                      <td className="text-right">{pcFmtMiles(d.odometer)}</td>
                      <td className="text-right">{pcFmt$(d.sale_price)}</td>
                      <td className="text-right">{pcFmt$(d.front_profit)}</td>
                      <td className="text-right">{pcFmt$(d.back_profit)}</td>
                      <td className="text-right">{pcFmt$(dealTotal(d))}</td>
                      <td className="text-right">
                        {d.age == null ? "—" : `${pcFmtN(d.age, 0)}d`}
                      </td>
                      <td className="text-right">{hasTrade ? "Yes" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inventory && (
        <div className="pc-panel pc-inv-bridge">
          <div className="pc-panel-label">On lot now</div>
          {inventory.count === 0 ? (
            <p className="pc-muted">
              {inventory.snapshotDate
                ? `No matching units on latest snapshot (${inventory.snapshotDate}).`
                : "No recent inventory upload for these stores."}
            </p>
          ) : (
            <>
              <div className="pc-kpi-grid pc-kpi-grid-compact">
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Units</div>
                  <div className="pc-kpi-value">{inventory.count}</div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Avg age</div>
                  <div
                    className={cn(
                      "pc-kpi-value",
                      inventory.avgAge != null && inventory.avgAge > 45
                        ? "amber"
                        : ""
                    )}
                  >
                    {inventory.avgAge == null
                      ? "—"
                      : `${pcFmtN(inventory.avgAge, 0)}d`}
                  </div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Over 60d</div>
                  <div
                    className={cn(
                      "pc-kpi-value",
                      inventory.over60 > 0 ? "red" : ""
                    )}
                  >
                    {inventory.over60}
                  </div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Cost on lot</div>
                  <div className="pc-kpi-value">
                    {pcFmt$(inventory.totalCost)}
                  </div>
                </div>
              </div>
              {invCue && <p className="pc-inv-cue">{invCue}</p>}
              {onLotHref && (
                <div className="pc-buybox-actions">
                  <Link href={onLotHref} className="pc-link">
                    View all {inventory.count} on lot →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
