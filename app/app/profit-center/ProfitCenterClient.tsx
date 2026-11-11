"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  aggregateByDimension,
  aggregateFinanceDepartments,
  buildTradesByDeal,
  filterDeals,
  type Dimension,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitFilters,
  type ProfitTrade,
  type RollupRow,
} from "@/lib/profit-center/aggregate";
import {
  DATE_PRESET_OPTIONS,
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import {
  rangeContains,
  sliceDealBundleToRange,
  type ProfitCenterDealBundle,
} from "@/lib/profit-center/dealBundle";
import { scoreBuyBox, type BuyBoxSettings } from "@/lib/profit-center/buyBox";
import { cn } from "@/lib/utils";
import { loadProfitCenterRange } from "./actions";
import {
  compareHref,
  modelCohortHref,
  PROFIT_CENTER_TABS,
  profitCenterHref,
  splitMakeModel,
  type ProfitCenterTabId,
} from "@/lib/profit-center/cohort";
import {
  sameMake,
  uniquePreservingPreferredCasing,
} from "@/lib/profit-center/vehicleIdentity";
import Link from "next/link";
import { fmt$, storePillLabel } from "./format";
import OverviewTab from "./tabs/OverviewTab";
import BuyBoxTab from "./tabs/BuyBoxTab";
import AcquisitionTab from "./tabs/AcquisitionTab";
import DepartmentPerformanceTab from "./tabs/DepartmentPerformanceTab";
import StockingTab from "./tabs/StockingTab";
import DealTableTab from "./tabs/DealTableTab";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };
type Department = { id: string; name: string; store_id: string };

type SortKey = keyof RollupRow;

const EMPTY_FILTERS: ProfitFilters = {
  storeId: "all",
  departmentName: "all",
  make: "all",
  model: "all",
  year: "all",
  priceBandId: "all",
  acquisition: "all",
  bodyStyle: "all",
  truckClass: "all",
  salespersonId: "all",
  financeType: "all",
};

interface Props {
  stores: Store[];
  departments: Department[];
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  salespeople: Salesperson[];
  dealSalespeople: ProfitDealSalesperson[];
  buyBoxSettings: BuyBoxSettings;
  groupName: string;
  preset: DatePreset;
  range: DateRange;
  initialStoreId?: string;
  initialDepartmentName?: string;
  initialTab?: ProfitCenterTabId;
}

type CachedRangeEntry = ProfitCenterDealBundle & {
  range: DateRange;
};

type InflightRangeResult = {
  preset: DatePreset;
  range: DateRange;
  bundle: ProfitCenterDealBundle;
};

export default function ProfitCenterClient({
  stores,
  departments,
  deals: initialDeals,
  trades: initialTrades,
  salespeople,
  dealSalespeople: initialDealSalespeople,
  buyBoxSettings,
  groupName,
  preset: initialPreset,
  range: initialRange,
  initialStoreId = "all",
  initialDepartmentName = "all",
  initialTab = "overview",
}: Props) {
  const pathname = usePathname();

  const [tab, setTab] = useState<ProfitCenterTabId>(initialTab);
  const [dimension, setDimension] = useState<Dimension>("make");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [buyBoxMinVolume, setBuyBoxMinVolume] = useState(
    buyBoxSettings.minVolume
  );
  const [filters, setFilters] = useState<ProfitFilters>(() => ({
    ...EMPTY_FILTERS,
    storeId:
      initialStoreId !== "all" && stores.some((s) => s.id === initialStoreId)
        ? initialStoreId
        : "all",
    departmentName: initialDepartmentName || "all",
  }));

  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [deals, setDeals] = useState<ProfitDeal[]>(initialDeals);
  const [trades, setTrades] = useState<ProfitTrade[]>(initialTrades);
  const [dealSalespeople, setDealSalespeople] = useState<
    ProfitDealSalesperson[]
  >(initialDealSalespeople);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const rangeCacheRef = useRef<Map<DatePreset, CachedRangeEntry>>(
    new Map([
      [
        initialPreset,
        {
          deals: initialDeals,
          trades: initialTrades,
          dealSalespeople: initialDealSalespeople,
          range: initialRange,
        },
      ],
    ])
  );
  const inflightRef = useRef<Map<DatePreset, Promise<InflightRangeResult>>>(
    new Map()
  );

  const applyBundle = useCallback(
    (
      nextPreset: DatePreset,
      nextRange: DateRange,
      bundle: ProfitCenterDealBundle
    ) => {
      setPreset(nextPreset);
      setRange(nextRange);
      setDeals(bundle.deals);
      setTrades(bundle.trades);
      setDealSalespeople(bundle.dealSalespeople);
      rangeCacheRef.current.set(nextPreset, {
        ...bundle,
        range: nextRange,
      });
    },
    []
  );

  // Keep shareable URL in sync without Next navigation — router.replace
  // remounts this page (loading.tsx) and resets store/date/department pills.
  useEffect(() => {
    const href = profitCenterHref({
      preset,
      storeId: filters.storeId,
      departmentName: filters.departmentName,
      tab,
    });
    const next = href.replace("/app/profit-center", pathname);
    const current = `${pathname}${window.location.search}`;
    if (current === next) return;
    window.history.replaceState(window.history.state, "", next);
  }, [preset, filters.storeId, filters.departmentName, tab, pathname]);

  const fetchPreset = useCallback(async (targetPreset: DatePreset) => {
    const existing = inflightRef.current.get(targetPreset);
    if (existing) return existing;

    const promise = (async (): Promise<InflightRangeResult> => {
      const result = await loadProfitCenterRange(targetPreset);
      if (!result.ok) {
        throw new Error(result.error);
      }
      const bundle: ProfitCenterDealBundle = {
        deals: result.deals,
        trades: result.trades,
        dealSalespeople: result.dealSalespeople,
      };
      rangeCacheRef.current.set(result.preset, {
        ...bundle,
        range: result.range,
      });
      return {
        preset: result.preset,
        range: result.range,
        bundle,
      };
    })().finally(() => {
      inflightRef.current.delete(targetPreset);
    });

    inflightRef.current.set(targetPreset, promise);
    return promise;
  }, []);

  useEffect(() => {
    if (initialPreset === "all_time") return;
    if (rangeCacheRef.current.has("all_time")) return;
    void fetchPreset("all_time").catch(() => {
      // Prefetch is best-effort; user-triggered loads surface errors.
    });
  }, [fetchPreset, initialPreset]);

  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);
  const salespersonNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespeople) m.set(s.id, s.name);
    return m;
  }, [salespeople]);
  const departmentNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const filtered = useMemo(
    () =>
      filterDeals(deals, filters, {
        tradesByDeal,
        dealSalespeople,
        departmentNames,
      }),
    [deals, filters, tradesByDeal, dealSalespeople, departmentNames]
  );

  /** Finance scoreboard ignores financeType filter so all three books stay visible. */
  const filteredForFinance = useMemo(
    () =>
      filterDeals(
        deals,
        { ...filters, financeType: "all" },
        {
          tradesByDeal,
          dealSalespeople,
          departmentNames,
        }
      ),
    [deals, filters, tradesByDeal, dealSalespeople, departmentNames]
  );

  const ctx = useMemo(
    () => ({
      deals: filtered,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
      departmentNames,
    }),
    [filtered, tradesByDeal, dealSalespeople, salespersonNames, departmentNames]
  );

  const financeCtx = useMemo(
    () => ({
      deals: filteredForFinance,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
      departmentNames,
    }),
    [
      filteredForFinance,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
      departmentNames,
    ]
  );

  const { rows, total } = useMemo(
    () => aggregateByDimension(dimension, ctx),
    [dimension, ctx]
  );

  const modelRows = useMemo(() => {
    if (dimension === "model") return rows;
    return aggregateByDimension("model", ctx).rows;
  }, [dimension, rows, ctx]);

  const overviewBuyBox = useMemo(
    () => scoreBuyBox(modelRows, buyBoxSettings),
    [modelRows, buyBoxSettings]
  );

  const tabBuyBoxSettings = useMemo(
    () => ({ ...buyBoxSettings, minVolume: buyBoxMinVolume }),
    [buyBoxSettings, buyBoxMinVolume]
  );

  const tabBuyBox = useMemo(
    () => scoreBuyBox(modelRows, tabBuyBoxSettings),
    [modelRows, tabBuyBoxSettings]
  );

  const acquisitionRows = useMemo(
    () => aggregateByDimension("acquisition", ctx).rows,
    [ctx]
  );

  const priceRows = useMemo(
    () => aggregateByDimension("price", ctx).rows,
    [ctx]
  );
  const odometerRows = useMemo(
    () => aggregateByDimension("odometer", ctx).rows,
    [ctx]
  );
  const yearRows = useMemo(
    () => aggregateByDimension("year", ctx).rows,
    [ctx]
  );
  const priceBox = useMemo(
    () => scoreBuyBox(priceRows, buyBoxSettings),
    [priceRows, buyBoxSettings]
  );
  const odometerBox = useMemo(
    () => scoreBuyBox(odometerRows, buyBoxSettings),
    [odometerRows, buyBoxSettings]
  );
  const yearBox = useMemo(
    () => scoreBuyBox(yearRows, buyBoxSettings),
    [yearRows, buyBoxSettings]
  );

  const financeDept = useMemo(
    () => aggregateFinanceDepartments(financeCtx),
    [financeCtx]
  );

  const cohortCtx = useMemo(
    () => ({
      preset,
      storeId: filters.storeId,
      departmentName: filters.departmentName,
    }),
    [preset, filters.storeId, filters.departmentName]
  );

  function modelHrefFromLabel(label: string) {
    const { make, model } = splitMakeModel(label, deals);
    return modelCohortHref(make, model, cohortCtx);
  }

  const makeRows = useMemo(() => {
    if (dimension === "make") return rows;
    return aggregateByDimension("make", ctx).rows;
  }, [dimension, rows, ctx]);

  const sortedRows = useMemo(() => {
    if (
      (dimension === "price" || dimension === "odometer") &&
      sortKey === "label"
    ) {
      return sortDir === "asc" ? [...rows] : [...rows].reverse();
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an =
        typeof av === "number" ? av : av == null ? -Infinity : Number(av);
      const bn =
        typeof bv === "number" ? bv : bv == null ? -Infinity : Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir, dimension]);

  const deptOptions = useMemo(() => {
    const scoped =
      filters.storeId === "all"
        ? departments
        : departments.filter((d) => d.store_id === filters.storeId);
    const names = [...new Set(scoped.map((d) => d.name))].sort((a, b) =>
      a.localeCompare(b)
    );
    return names;
  }, [departments, filters.storeId]);

  const filterOptions = useMemo(() => {
    const makes = uniquePreservingPreferredCasing(
      deals.map((d) => d.vehicle_make)
    );
    const models = uniquePreservingPreferredCasing(
      deals
        .filter(
          (d) => filters.make === "all" || sameMake(d.vehicle_make, filters.make)
        )
        .map((d) => d.vehicle_model)
    );
    const years = [...new Set(deals.map((d) => String(d.vehicle_year)))].sort(
      (a, b) => Number(b) - Number(a)
    );
    const acquisitions = [
      ...new Set(
        deals.map((d) => d.acquisition_source?.trim() || "(Unknown)")
      ),
    ].sort();
    const bodyStyles = [
      ...new Set(deals.map((d) => d.body_style?.trim() || "(Unknown)")),
    ].sort();
    return { makes, models, years, acquisitions, bodyStyles };
  }, [deals, filters.make]);

  const navigateDate = useCallback(
    async (nextPreset: DatePreset) => {
      if (nextPreset === preset || dateLoading) return;

      setDateError(null);
      const nextRange = resolveDateRange(nextPreset);
      const cache = rangeCacheRef.current;

      const exact = cache.get(nextPreset);
      if (exact) {
        applyBundle(nextPreset, exact.range, exact);
        return;
      }

      for (const entry of cache.values()) {
        if (rangeContains(entry.range, nextRange)) {
          const sliced = sliceDealBundleToRange(entry, nextRange);
          applyBundle(nextPreset, nextRange, sliced);
          return;
        }
      }

      setDateLoading(true);
      try {
        const loaded = await fetchPreset(nextPreset);
        applyBundle(loaded.preset, loaded.range, loaded.bundle);
      } catch (e) {
        setDateError(
          e instanceof Error ? e.message : "Failed to load date range."
        );
      } finally {
        setDateLoading(false);
      }
    },
    [applyBundle, dateLoading, fetchPreset, preset]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  }

  function onDimensionChange(d: Dimension) {
    setDimension(d);
    if (d === "odometer" || d === "price") {
      setSortKey("label");
      setSortDir("asc");
    } else {
      setSortKey("volume");
      setSortDir("desc");
    }
  }

  const selectedStore =
    filters.storeId === "all"
      ? null
      : stores.find((s) => s.id === filters.storeId) ?? null;

  const title =
    selectedStore?.name ??
    (stores.length > 1 ? "All Stores" : groupName || "Profit Center");

  const ages = filtered
    .map((d) => d.age)
    .filter((a): a is number => a != null && Number.isFinite(a));
  const avgTurn =
    ages.length === 0 ? null : ages.reduce((s, a) => s + a, 0) / ages.length;
  const tradeDealCount = filtered.filter(
    (d) => (tradesByDeal.get(d.id) ?? []).length > 0
  ).length;
  const tradePct =
    filtered.length === 0 ? null : (tradeDealCount / filtered.length) * 100;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquisition intelligence</p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01"
              ? "All time"
              : `${range.from} → ${range.to}`}
            {" · "}
            {filtered.length.toLocaleString()} closed deal
            {filtered.length === 1 ? "" : "s"}
            {" · "}
            {fmt$(total.total)} total gross
            {filtered.length !== deals.length
              ? ` · filtered from ${deals.length.toLocaleString()}`
              : ""}
          </p>
          {stores.length > 1 && (
            <p className="pc-meta">
              <Link
                href={compareHref({
                  type: "store",
                  a: stores[0]!.id,
                  b: stores[1]!.id,
                  preset,
                  departmentName: filters.departmentName,
                })}
                className="pc-link"
              >
                Compare stores side-by-side
              </Link>
            </p>
          )}
        </div>
        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Store">
            <button
              type="button"
              className={cn("pc-pill", filters.storeId === "all" && "is-active")}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  storeId: "all",
                  departmentName: "all",
                }))
              }
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "pc-pill",
                  filters.storeId === s.id && "is-active"
                )}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    storeId: s.id,
                    departmentName: "all",
                  }))
                }
              >
                {storePillLabel(s.name)}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">
          Date range
          {dateLoading ? " · Loading…" : ""}
        </p>
        <div
          className={cn("pc-pill-row", dateLoading && "is-loading")}
          aria-busy={dateLoading}
        >
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={dateLoading}
              onClick={() => void navigateDate(opt.value)}
              className={cn(
                "pc-pill is-soft",
                preset === opt.value && "is-active"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {dateError ? <p className="pc-muted">{dateError}</p> : null}
      </section>

      {deptOptions.length > 0 && (
        <section className="pc-panel">
          <p className="pc-panel-label">Department</p>
          <div className="pc-pill-row">
            <button
              type="button"
              className={cn(
                "pc-pill is-soft",
                filters.departmentName === "all" && "is-active"
              )}
              onClick={() =>
                setFilters((f) => ({ ...f, departmentName: "all" }))
              }
            >
              All
            </button>
            {deptOptions.map((name) => (
              <button
                key={name}
                type="button"
                className={cn(
                  "pc-pill is-soft",
                  filters.departmentName === name && "is-active"
                )}
                onClick={() =>
                  setFilters((f) => ({ ...f, departmentName: name }))
                }
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pc-tabs" role="tablist" aria-label="Profit Center views">
        {PROFIT_CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("pc-tab", tab === t.id && "is-active")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {tab === "overview" ? (
          <OverviewTab
            total={total}
            filteredCount={filtered.length}
            avgTurn={avgTurn}
            tradePct={tradePct}
            buyBox={overviewBuyBox}
            minVolume={buyBoxSettings.minVolume}
            makeRows={makeRows}
            financeRows={financeDept.rows}
            financeTypedVolume={financeDept.typedVolume}
            onOpenTab={setTab}
          />
        ) : null}

        {tab === "buy-box" ? (
          <BuyBoxTab
            buyBox={tabBuyBox}
            groupDefaultMin={buyBoxSettings.minVolume}
            minVolume={buyBoxMinVolume}
            onMinVolumeChange={setBuyBoxMinVolume}
            settings={tabBuyBoxSettings}
            modelHrefFromLabel={modelHrefFromLabel}
            cohortCtx={cohortCtx}
          />
        ) : null}

        {tab === "acquisition" ? (
          <AcquisitionTab rows={acquisitionRows} cohortCtx={cohortCtx} />
        ) : null}

        {tab === "department" ? (
          <DepartmentPerformanceTab
            rows={financeDept.rows}
            overall={financeDept.overall}
            outsideCount={financeDept.outsideCount}
            typedVolume={financeDept.typedVolume}
            cohortCtx={cohortCtx}
          />
        ) : null}

        {tab === "stocking" ? (
          <StockingTab
            priceBox={priceBox}
            odometerBox={odometerBox}
            yearBox={yearBox}
            cohortCtx={cohortCtx}
          />
        ) : null}

        {tab === "deals" ? (
          <DealTableTab
            filters={filters}
            setFilters={setFilters}
            emptyFilters={{
              ...EMPTY_FILTERS,
              storeId: filters.storeId,
              departmentName: filters.departmentName,
            }}
            filterOptions={filterOptions}
            salespeople={salespeople}
            dimension={dimension}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            onDimensionChange={onDimensionChange}
            sortedRows={sortedRows}
            total={total}
            filteredCount={filtered.length}
            dealsCount={deals.length}
          />
        ) : null}
      </div>
    </div>
  );
}
