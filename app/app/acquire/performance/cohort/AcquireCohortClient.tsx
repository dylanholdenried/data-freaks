"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AcqPurchase } from "@/lib/acquire/types";
import {
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_LABELS,
  ACQ_STAGE_LABELS,
  isCompletedStage,
} from "@/lib/acquire/types";
import { shortStoreLabel } from "@/lib/acquire/store-labels";
import {
  effectiveGross,
  headerAgeDays,
  merchCost,
  websitePrice,
} from "@/lib/acquire/cost";
import {
  acquireModelCohortHref,
  acquirePerformanceHref,
  buildOverview,
  exitOf,
  filterSoldInRange,
  purchaseMatchesMakeModel,
  sellerKey,
  turnDays,
} from "@/lib/acquire/performance-analytics";
import {
  DATE_PRESET_OPTIONS,
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import { fmt$, fmtN, fmtPct } from "@/app/app/profit-center/format";

type SortKey =
  | "stock"
  | "store"
  | "buyer"
  | "source"
  | "seller"
  | "exit"
  | "purchase_date"
  | "sold_date"
  | "turn"
  | "front"
  | "back"
  | "total";

type InvSortKey =
  | "stock"
  | "year"
  | "store"
  | "stage"
  | "source"
  | "seller"
  | "age"
  | "odometer"
  | "cost"
  | "price";

export default function AcquireCohortClient({
  stores,
  initialStoreIds,
  purchases,
  buyers,
  initialPreset,
  make,
  model,
}: {
  stores: { id: string; name: string }[];
  initialStoreIds: string[];
  purchases: AcqPurchase[];
  buyers: { id: string; name: string }[];
  initialPreset: DatePreset;
  make: string;
  model: string;
}) {
  const router = useRouter();
  const allIds = stores.map((s) => s.id);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    initialStoreIds.length ? initialStoreIds : allIds
  );
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [sortKey, setSortKey] = useState<SortKey>("sold_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exitFilter, setExitFilter] = useState<"all" | "retail" | "wholesale">(
    "all"
  );
  const [invStoreId, setInvStoreId] = useState<string>("all");
  const [invYear, setInvYear] = useState<string>("all");
  const [invSortKey, setInvSortKey] = useState<InvSortKey>("age");
  const [invSortDir, setInvSortDir] = useState<"asc" | "desc">("desc");

  const range = useMemo(() => resolveDateRange(preset), [preset]);
  const title =
    make || model
      ? [make, model].filter(Boolean).join(" ")
      : "Select a model";

  const storeName = useMemo(() => {
    const m = new Map(stores.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "Unassigned");
  }, [stores]);

  const buyerName = useMemo(() => {
    const m = new Map(buyers.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [buyers]);

  const storeScoped = useMemo(() => {
    const allowed = new Set(selectedStoreIds);
    return purchases.filter(
      (p) => p.store_id == null || allowed.has(p.store_id)
    );
  }, [purchases, selectedStoreIds]);

  const cohortAll = useMemo(() => {
    if (!make && !model) return [];
    return storeScoped.filter((p) =>
      purchaseMatchesMakeModel(p, make, model)
    );
  }, [storeScoped, make, model]);

  const soldInRange = useMemo(
    () => filterSoldInRange(cohortAll, range),
    [cohortAll, range]
  );

  const overview = useMemo(() => buildOverview(soldInRange), [soldInRange]);

  /** Unsold Acquire units for this model — ignores sold date preset. */
  const inventoryUnits = useMemo(() => {
    return cohortAll.filter((p) => !isCompletedStage(p.stage));
  }, [cohortAll]);

  const inventoryForStorePills = useMemo(() => {
    if (invYear === "all") return inventoryUnits;
    return inventoryUnits.filter(
      (p) => String(p.vehicle_year ?? "") === invYear
    );
  }, [inventoryUnits, invYear]);

  const inventoryForYearPills = useMemo(() => {
    if (invStoreId === "all") return inventoryUnits;
    return inventoryUnits.filter((p) => {
      const id = p.store_id ?? "__unassigned";
      return id === invStoreId;
    });
  }, [inventoryUnits, invStoreId]);

  const invStoreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of inventoryForStorePills) {
      const id = p.store_id ?? "__unassigned";
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name:
          id === "__unassigned"
            ? "Unassigned"
            : shortStoreLabel(storeName(id)),
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryForStorePills, storeName]);

  const invYearOptions = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of inventoryForYearPills) {
      if (p.vehicle_year == null || !Number.isFinite(p.vehicle_year)) continue;
      counts.set(p.vehicle_year, (counts.get(p.vehicle_year) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
  }, [inventoryForYearPills]);

  const inventoryFiltered = useMemo(() => {
    return inventoryUnits.filter((p) => {
      if (invStoreId !== "all") {
        const id = p.store_id ?? "__unassigned";
        if (id !== invStoreId) return false;
      }
      if (invYear !== "all") {
        if (String(p.vehicle_year ?? "") !== invYear) return false;
      }
      return true;
    });
  }, [inventoryUnits, invStoreId, invYear]);

  const inventorySorted = useMemo(() => {
    const copy = [...inventoryFiltered];
    copy.sort((a, b) => {
      const val = (p: AcqPurchase): string | number => {
        switch (invSortKey) {
          case "stock":
            return (p.stock_number ?? "").toLowerCase();
          case "year":
            return p.vehicle_year ?? -Infinity;
          case "store":
            return storeName(p.store_id).toLowerCase();
          case "stage":
            return ACQ_STAGE_LABELS[p.stage] ?? p.stage;
          case "source":
            return ACQ_SOURCE_LABELS[p.source_type] ?? p.source_type;
          case "seller":
            return sellerKey(p).toLowerCase();
          case "age":
            return headerAgeDays(p) ?? -Infinity;
          case "odometer":
            return p.odometer ?? -Infinity;
          case "cost":
            return merchCost(p) ?? -Infinity;
          case "price":
            return websitePrice(p) ?? -Infinity;
        }
      };
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") {
        return invSortDir === "asc" ? av - bv : bv - av;
      }
      return invSortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [inventoryFiltered, invSortKey, invSortDir, storeName]);

  const tableRows = useMemo(() => {
    let rows = soldInRange;
    if (exitFilter === "retail") {
      rows = rows.filter((p) => {
        const e = exitOf(p);
        return e === "prime" || e === "subprime" || e === "cash";
      });
    } else if (exitFilter === "wholesale") {
      rows = rows.filter((p) => exitOf(p) === "wholesale");
    }
    return rows;
  }, [soldInRange, exitFilter]);

  const sorted = useMemo(() => {
    const copy = [...tableRows];
    copy.sort((a, b) => {
      const val = (p: AcqPurchase): string | number => {
        switch (sortKey) {
          case "stock":
            return (p.stock_number ?? "").toLowerCase();
          case "store":
            return storeName(p.store_id).toLowerCase();
          case "buyer":
            return buyerName(p.buyer_id).toLowerCase();
          case "source":
            return ACQ_SOURCE_LABELS[p.source_type] ?? p.source_type;
          case "seller":
            return sellerKey(p).toLowerCase();
          case "exit": {
            const e = exitOf(p);
            return e ? ACQ_EXIT_STRATEGY_LABELS[e] : "";
          }
          case "purchase_date":
            return p.purchase_date ?? "";
          case "sold_date":
            return p.sold_date ?? "";
          case "turn":
            return turnDays(p) ?? -Infinity;
          case "front":
            return p.front_gross ?? -Infinity;
          case "back":
            return p.back_gross ?? -Infinity;
          case "total":
            return effectiveGross(p) ?? -Infinity;
        }
      };
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [tableRows, sortKey, sortDir, storeName, buyerName]);

  const retailKpi = overview.retail;
  const wsKpi = overview.wholesale;

  function navigate(next: { storeIds?: string[]; preset?: DatePreset }) {
    const href = acquireModelCohortHref(make, model, {
      preset: next.preset ?? preset,
      storeIds: next.storeIds ?? selectedStoreIds,
      allStoreIds: allIds,
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

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(
        k === "stock" || k === "store" || k === "buyer" || k === "seller"
          ? "asc"
          : "desc"
      );
    }
  }

  function mark(k: SortKey) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  function toggleInvSort(k: InvSortKey) {
    if (invSortKey === k) setInvSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setInvSortKey(k);
      setInvSortDir(
        k === "stock" || k === "store" || k === "seller" || k === "stage"
          ? "asc"
          : "desc"
      );
    }
  }

  function invMark(k: InvSortKey) {
    return invSortKey === k ? (invSortDir === "asc" ? " ↑" : " ↓") : "";
  }

  const th = (k: SortKey, label: string) => (
    <th>
      <button type="button" className="pc-sort" onClick={() => toggleSort(k)}>
        {label}
        {mark(k)}
      </button>
    </th>
  );

  const invTh = (k: InvSortKey, label: string) => (
    <th>
      <button
        type="button"
        className="pc-sort"
        onClick={() => toggleInvSort(k)}
      >
        {label}
        {invMark(k)}
      </button>
    </th>
  );

  const backHref = acquirePerformanceHref({
    preset,
    storeIds: selectedStoreIds,
    allStoreIds: allIds,
    tab: "buy-box",
  });

  const allStoresSelected =
    selectedStoreIds.length === allIds.length && allIds.length > 0;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquire · Model cohort</p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01"
              ? "All time"
              : `${range.from} → ${range.to}`}
            {" · "}
            {soldInRange.length.toLocaleString()} sold purchase
            {soldInRange.length === 1 ? "" : "s"}
            {" · "}
            {fmt$(retailKpi.total)} retail total gross
          </p>
          <p className="pc-meta">
            Purchase-card economics only — same universe as Acquire Performance.
          </p>
          <p className="pc-meta" style={{ marginTop: 10 }}>
            <Link href={backHref} className="pc-link">
              ← Back to Buy-Box
            </Link>
          </p>
        </div>
        {stores.length > 0 ? (
          <div className="pc-store-pills" role="group" aria-label="Stores">
            <button
              type="button"
              className={cn("pc-pill", allStoresSelected && "is-active")}
              onClick={() => onStoresChange(allIds)}
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
              onClick={() => {
                setPreset(opt.value);
                navigate({ preset: opt.value });
              }}
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

      {!make && !model ? (
        <p className="pc-muted">
          Open a model from the Buy-Box tab to see its Acquire purchases.
        </p>
      ) : (
        <>
          <div className="pc-kpi-grid">
            <div className="pc-kpi">
              <div className="pc-kpi-label">Sold units</div>
              <div className="pc-kpi-value">{fmtN(overview.totalSold)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Retail units</div>
              <div className="pc-kpi-value">{fmtN(retailKpi.retailCount)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Avg front</div>
              <div className="pc-kpi-value">{fmt$(retailKpi.avgFront)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Avg back</div>
              <div className="pc-kpi-value">{fmt$(retailKpi.avgBack)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Avg total</div>
              <div className="pc-kpi-value">{fmt$(retailKpi.avgTotal)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Avg turn</div>
              <div
                className={cn(
                  "pc-kpi-value",
                  retailKpi.avgTurn != null && retailKpi.avgTurn > 45 && "red"
                )}
              >
                {retailKpi.avgTurn == null
                  ? "—"
                  : `${fmtN(retailKpi.avgTurn, 0)}d`}
              </div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Trade %</div>
              <div className="pc-kpi-value">{fmtPct(retailKpi.tradePct)}</div>
            </div>
            <div className="pc-kpi">
              <div className="pc-kpi-label">Wholesale %</div>
              <div className="pc-kpi-value">
                {fmtPct(
                  overview.totalSold
                    ? (wsKpi.soldCount / overview.totalSold) * 100
                    : null
                )}
              </div>
              <div className="pc-kpi-sub">
                avg {fmt$(wsKpi.avgWholesaleGross)}
              </div>
            </div>
          </div>

          <section className="pc-stocking">
            <div className="pc-buybox-head">
              <h2>Sold purchases</h2>
              <p>
                Card economics for this model in the selected stores and date
                range.
              </p>
            </div>

            <div className="pc-pill-row" style={{ marginBottom: 12 }}>
              {(
                [
                  ["all", "All exits"],
                  ["retail", "Retail only"],
                  ["wholesale", "Wholesale only"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "pc-pill is-soft",
                    exitFilter === id && "is-active"
                  )}
                  onClick={() => setExitFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {sorted.length === 0 ? (
              <p className="pc-muted">No sold purchases in this cut.</p>
            ) : (
              <div className="pc-table-wrap">
                <table className="pc-table" style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      {th("stock", "Stock")}
                      {th("store", "Store")}
                      {th("buyer", "Buyer")}
                      {th("source", "Source")}
                      {th("seller", "Seller")}
                      {th("exit", "Exit")}
                      {th("purchase_date", "Purchased")}
                      {th("sold_date", "Sold")}
                      {th("turn", "Turn")}
                      {th("front", "Front")}
                      {th("back", "Back")}
                      {th("total", "Total")}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p) => {
                      const exit = exitOf(p);
                      const turn = turnDays(p);
                      const total = effectiveGross(p);
                      return (
                        <tr key={p.id}>
                          <td>{p.stock_number ?? "—"}</td>
                          <td>{shortStoreLabel(storeName(p.store_id))}</td>
                          <td>{buyerName(p.buyer_id)}</td>
                          <td>
                            {ACQ_SOURCE_LABELS[p.source_type] ?? p.source_type}
                          </td>
                          <td>{sellerKey(p)}</td>
                          <td>
                            {exit
                              ? ACQ_EXIT_STRATEGY_LABELS[exit]
                              : ACQ_STAGE_LABELS[p.stage]}
                          </td>
                          <td>{p.purchase_date ?? "—"}</td>
                          <td>{p.sold_date ?? "—"}</td>
                          <td>{turn == null ? "—" : `${fmtN(turn, 0)}d`}</td>
                          <td>{fmt$(p.front_gross)}</td>
                          <td>{fmt$(p.back_gross)}</td>
                          <td
                            style={{
                              color:
                                total != null && total < 0
                                  ? "var(--da-red)"
                                  : undefined,
                            }}
                          >
                            {fmt$(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="pc-stocking">
            <div className="pc-buybox-head">
              <h2>Current inventory</h2>
              <p>
                Unsold Acquire purchases for this model
                {inventoryUnits.length
                  ? ` · ${inventoryFiltered.length.toLocaleString()} of ${inventoryUnits.length.toLocaleString()} on hand`
                  : ""}
                . Not filtered by the sold date range above.
              </p>
            </div>

            {inventoryUnits.length === 0 ? (
              <p className="pc-muted">
                No unsold Acquire units for this model in the selected stores.
              </p>
            ) : (
              <>
                <p className="pc-panel-label">Store</p>
                <div className="pc-pill-row" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className={cn(
                      "pc-pill is-soft pc-pill-with-count",
                      invStoreId === "all" && "is-active"
                    )}
                    onClick={() => setInvStoreId("all")}
                  >
                    <span className="pc-pill-label">All</span>
                    <span className="pc-filter-count">
                      {inventoryForStorePills.length}
                    </span>
                  </button>
                  {invStoreOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={cn(
                        "pc-pill is-soft pc-pill-with-count",
                        invStoreId === opt.id && "is-active"
                      )}
                      onClick={() => setInvStoreId(opt.id)}
                    >
                      <span className="pc-pill-label">{opt.name}</span>
                      <span className="pc-filter-count">{opt.count}</span>
                    </button>
                  ))}
                </div>

                <p className="pc-panel-label">Year</p>
                <div className="pc-pill-row" style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className={cn(
                      "pc-pill is-soft pc-pill-with-count",
                      invYear === "all" && "is-active"
                    )}
                    onClick={() => setInvYear("all")}
                  >
                    <span className="pc-pill-label">All</span>
                    <span className="pc-filter-count">
                      {inventoryForYearPills.length}
                    </span>
                  </button>
                  {invYearOptions.map((opt) => (
                    <button
                      key={opt.year}
                      type="button"
                      className={cn(
                        "pc-pill is-soft pc-pill-with-count",
                        invYear === String(opt.year) && "is-active"
                      )}
                      onClick={() => setInvYear(String(opt.year))}
                    >
                      <span className="pc-pill-label">{opt.year}</span>
                      <span className="pc-filter-count">{opt.count}</span>
                    </button>
                  ))}
                </div>

                {inventorySorted.length === 0 ? (
                  <p className="pc-muted">
                    No units match the store / year filters.
                  </p>
                ) : (
                  <div className="pc-table-wrap">
                    <table className="pc-table" style={{ minWidth: 1080 }}>
                      <thead>
                        <tr>
                          {invTh("stock", "Stock")}
                          {invTh("year", "Year")}
                          {invTh("store", "Store")}
                          {invTh("stage", "Status")}
                          {invTh("source", "Source")}
                          {invTh("seller", "Seller")}
                          {invTh("age", "Age")}
                          {invTh("odometer", "Odo")}
                          {invTh("cost", "Cost")}
                          {invTh("price", "Price")}
                        </tr>
                      </thead>
                      <tbody>
                        {inventorySorted.map((p) => {
                          const age = headerAgeDays(p);
                          return (
                            <tr key={p.id}>
                              <td>{p.stock_number ?? "—"}</td>
                              <td>{p.vehicle_year ?? "—"}</td>
                              <td>
                                {shortStoreLabel(storeName(p.store_id))}
                              </td>
                              <td>
                                {ACQ_STAGE_LABELS[p.stage] ?? p.stage}
                                {p.on_hold ? (
                                  <span
                                    className="pc-muted"
                                    style={{ marginLeft: 6, fontWeight: 500 }}
                                  >
                                    · Hold
                                  </span>
                                ) : null}
                              </td>
                              <td>
                                {ACQ_SOURCE_LABELS[p.source_type] ??
                                  p.source_type}
                              </td>
                              <td>{sellerKey(p)}</td>
                              <td>
                                {age == null ? "—" : `${fmtN(age, 0)}d`}
                              </td>
                              <td>
                                {p.odometer == null
                                  ? "—"
                                  : fmtN(p.odometer, 0)}
                              </td>
                              <td>{fmt$(merchCost(p))}</td>
                              <td>{fmt$(websitePrice(p))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
