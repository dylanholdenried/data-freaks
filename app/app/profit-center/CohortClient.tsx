"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  aggregateByDimension,
  buildTradesByDeal,
  type Dimension,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitTrade,
  type RollupRow,
} from "@/lib/profit-center/aggregate";
import {
  columnExtent,
  heatmapStyle,
  type HeatPolarity,
} from "@/lib/profit-center/heatmap";
import { buildCohortRecommendations } from "@/lib/profit-center/cohortRecommendations";
import {
  compareHref,
  dealMatchesCohort,
  profitCenterHref,
  type CohortFocus,
} from "@/lib/profit-center/cohort";
import {
  applyCohortDealFilters,
  buildFinanceFilterOptions,
  buildStoreFilterOptions,
  buildTrimFilterOptions,
  buildYearFilterOptions,
  EMPTY_DIAL_IN,
  hasActiveDialIn,
  toggleInList,
  writeDialInToSearchParams,
  type CohortDialInFilters,
  type CohortFilterOption,
} from "@/lib/profit-center/cohortFilters";
import { buildStoreScorecard } from "@/lib/profit-center/cohortStoreScorecard";
import {
  buildSweetSpotCombos,
  type SweetSpotCombo,
} from "@/lib/profit-center/cohortSweetSpot";
import {
  pcFmt$,
  pcFmtMiles,
  pcFmtN,
  pcFmtPct,
} from "@/lib/profit-center/format";
import {
  filterModelInventoryUnits,
  inventoryBridgeCue,
  rateInventoryUnits,
  summarizeModelInventory,
  type RatedInventoryUnit,
  type UnitRating,
} from "@/lib/profit-center/inventoryBridge";
import type { BuyBoxSettings, ScoredModel } from "@/lib/profit-center/buyBox";
import {
  DATE_PRESET_OPTIONS,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import type { InvUnitWithStore } from "@/lib/profit-center/loadInventory";
import { financeLabel } from "@/lib/dashboard/pace";
import { loadProfitCenterRange } from "@/app/app/profit-center/actions";
import { cn } from "@/lib/utils";
import type { StockAction } from "@/lib/sold-vs-stock/types";

type OnLotSortKey = "store" | "stk" | "age" | "cost" | "price" | "ph" | "rating";

function onLotRatingLabel(r: UnitRating) {
  if (r === "good") return "Good";
  if (r === "bad") return "Bad";
  return "Neutral";
}

function onLotRatingClass(r: UnitRating) {
  if (r === "good") return "buy";
  if (r === "bad") return "red";
  return "near";
}

function sortRatedOnLot(
  rows: RatedInventoryUnit[],
  key: OnLotSortKey,
  dir: "asc" | "desc",
  storeNames: Map<string, string>
): RatedInventoryUnit[] {
  const order = { good: 2, neutral: 1, bad: 0 };
  const copy = [...rows];
  copy.sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    const ua = a.unit as InvUnitWithStore;
    const ub = b.unit as InvUnitWithStore;
    switch (key) {
      case "store":
        av = storeNames.get(ua.store_id) ?? "";
        bv = storeNames.get(ub.store_id) ?? "";
        break;
      case "stk":
        av = ua.stk;
        bv = ub.stk;
        break;
      case "age":
        av = ua.age ?? -Infinity;
        bv = ub.age ?? -Infinity;
        break;
      case "cost":
        av = ua.cost ?? -Infinity;
        bv = ub.cost ?? -Infinity;
        break;
      case "price":
        av = ua.price ?? -Infinity;
        bv = ub.price ?? -Infinity;
        break;
      case "ph":
        av = ua.ph ?? -Infinity;
        bv = ub.ph ?? -Infinity;
        break;
      case "rating":
        av = order[a.rating];
        bv = order[b.rating];
        break;
    }
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return dir === "asc" ? an - bn : bn - an;
  });
  return copy;
}

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

type DealSortKey =
  | "store"
  | "stock"
  | "sale_date"
  | "finance"
  | "year"
  | "trim"
  | "odometer"
  | "sale_price"
  | "front"
  | "back"
  | "total"
  | "age"
  | "trade";

type CachedRangeEntry = {
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  range: DateRange;
};

type InflightRangeResult = {
  preset: DatePreset;
  range: DateRange;
  deals: ProfitDeal[];
  trades: ProfitTrade[];
};

const ACTION_META: Record<StockAction, { label: string; chip: string }> = {
  need_more: { label: "Need more", chip: "svs-chip need-more" },
  too_much: { label: "Too much", chip: "svs-chip too-much" },
  balanced: { label: "Balanced", chip: "svs-chip balanced" },
  watch: { label: "Watch", chip: "svs-chip watch" },
};

/** Format ISO date (YYYY-MM-DD) as MM/DD/YY. */
function formatSaleDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]!.slice(2)}`;
}

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
  tradesByDeal: Map<string, ProfitTrade[]>,
  storeNames: Map<string, string>
): string | number {
  switch (key) {
    case "store":
      return storeNames.get(d.store_id) ?? "";
    case "stock":
      return d.stock_number?.trim() || "";
    case "sale_date":
      return d.sale_date;
    case "finance":
      return financeLabel(d.finance_type);
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

function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: CohortFilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));
  return (
    <div className="pc-filter-group">
      <span className="pc-filter-group-label">{label}</span>
      <div className="pc-pill-row">
        {options.map((opt) => {
          const active = selectedSet.has(opt.value.toLowerCase());
          return (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "pc-pill is-soft pc-pill-with-count",
                active && "is-active"
              )}
              onClick={() => onToggle(opt.value)}
            >
              <span className="pc-pill-label">{opt.label}</span>
              <span className="pc-filter-count">{opt.count}</span>
            </button>
          );
        })}
      </div>
    </div>
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
  preset: DatePreset;
  range: DateRange;
  storeId: string;
  departmentName: string;
  inventoryUnits: InvUnitWithStore[];
  inventorySnapshotDate: string | null;
  initialDialIn?: CohortDialInFilters;
}

export default function CohortClient({
  title,
  focus,
  make,
  model,
  value,
  stores,
  departments,
  cohortDeals: initialCohortDeals,
  trades: initialTrades,
  buyBoxSettings,
  signal,
  preset: initialPreset,
  range: initialRange,
  storeId,
  departmentName,
  inventoryUnits,
  inventorySnapshotDate,
  initialDialIn = EMPTY_DIAL_IN,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [sortKey, setSortKey] = useState<DealSortKey>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dialIn, setDialIn] = useState<CohortDialInFilters>(initialDialIn);
  /** Local to On lot section — does not affect dial-in / KPIs / scorecard. */
  const [onLotStoreId, setOnLotStoreId] = useState<string>("all");
  const [onLotRatingFilter, setOnLotRatingFilter] = useState<
    "all" | UnitRating
  >("all");
  const [onLotSortKey, setOnLotSortKey] = useState<OnLotSortKey>("rating");
  const [onLotSortDir, setOnLotSortDir] = useState<"asc" | "desc">("desc");
  const [yearSortKey, setYearSortKey] = useState<
    | "label"
    | "volume"
    | "avgFront"
    | "avgBack"
    | "avgTotal"
    | "avgAge"
    | "tradePct"
  >("label");
  const [yearSortDir, setYearSortDir] = useState<"asc" | "desc">("desc");

  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [cohortDeals, setCohortDeals] =
    useState<ProfitDeal[]>(initialCohortDeals);
  const [trades, setTrades] = useState<ProfitTrade[]>(initialTrades);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const rangeCacheRef = useRef<Map<DatePreset, CachedRangeEntry>>(
    new Map([
      [
        initialPreset,
        {
          deals: initialCohortDeals,
          trades: initialTrades,
          range: initialRange,
        },
      ],
    ])
  );
  const inflightRef = useRef<Map<DatePreset, Promise<InflightRangeResult>>>(
    new Map()
  );

  const departmentNames = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name] as const)),
    [departments]
  );

  const rematchCohort = useCallback(
    (deals: ProfitDeal[]) =>
      deals.filter((d) => {
        if (storeId !== "all" && d.store_id !== storeId) return false;
        if (departmentName !== "all") {
          const name = d.department_id
            ? departmentNames.get(d.department_id) ?? "(Unknown)"
            : "(Unassigned)";
          if (name !== departmentName) return false;
        }
        return dealMatchesCohort(d, focus, { make, model, value });
      }),
    [focus, make, model, value, storeId, departmentName, departmentNames]
  );

  const fetchPreset = useCallback(
    async (targetPreset: DatePreset): Promise<InflightRangeResult> => {
      const existing = inflightRef.current.get(targetPreset);
      if (existing) return existing;

      const promise = (async (): Promise<InflightRangeResult> => {
        const result = await loadProfitCenterRange(targetPreset);
        if (!result.ok) throw new Error(result.error);
        const matched = rematchCohort(result.deals);
        const entry: InflightRangeResult = {
          preset: result.preset,
          range: result.range,
          deals: matched,
          trades: result.trades,
        };
        rangeCacheRef.current.set(result.preset, {
          deals: matched,
          trades: result.trades,
          range: result.range,
        });
        return entry;
      })().finally(() => {
        inflightRef.current.delete(targetPreset);
      });

      inflightRef.current.set(targetPreset, promise);
      return promise;
    },
    [rematchCohort]
  );

  const onPresetChange = useCallback(
    async (nextPreset: DatePreset) => {
      if (nextPreset === preset || dateLoading) return;
      setDateError(null);

      const cached = rangeCacheRef.current.get(nextPreset);
      if (cached) {
        setPreset(nextPreset);
        setRange(cached.range);
        setCohortDeals(cached.deals);
        setTrades(cached.trades);
        return;
      }

      setDateLoading(true);
      try {
        const loaded = await fetchPreset(nextPreset);
        setPreset(loaded.preset);
        setRange(loaded.range);
        setCohortDeals(loaded.deals);
        setTrades(loaded.trades);
      } catch (e) {
        setDateError(
          e instanceof Error ? e.message : "Failed to load date range."
        );
      } finally {
        setDateLoading(false);
      }
    },
    [preset, dateLoading, fetchPreset]
  );

  // Keep shareable URL in sync for preset + dial-in + page scope
  useEffect(() => {
    const q = new URLSearchParams();
    q.set("focus", focus);
    if (focus === "model") {
      if (make) q.set("make", make);
      if (model) q.set("model", model);
      if (value) q.set("value", value);
    } else if (value) {
      q.set("value", value);
    }
    q.set("preset", preset);
    if (storeId !== "all") q.set("store", storeId);
    if (departmentName !== "all") q.set("department", departmentName);
    writeDialInToSearchParams(q, dialIn);
    router.replace(`${pathname}?${q.toString()}`);
  }, [
    focus,
    make,
    model,
    value,
    preset,
    storeId,
    departmentName,
    dialIn,
    pathname,
    router,
  ]);

  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);
  const storeNames = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name] as const)),
    [stores]
  );

  const filtersActive = hasActiveDialIn(dialIn);

  const filteredDeals = useMemo(
    () => applyCohortDealFilters(cohortDeals, dialIn),
    [cohortDeals, dialIn]
  );

  const unfilteredCtx = useMemo(
    () => ({
      deals: cohortDeals,
      tradesByDeal,
      dealSalespeople: [] as ProfitDealSalesperson[],
      salespersonNames: new Map<string, string>(),
      departmentNames: new Map<string, string>(),
    }),
    [cohortDeals, tradesByDeal]
  );

  const filteredCtx = useMemo(
    () => ({
      deals: filteredDeals,
      tradesByDeal,
      dealSalespeople: [] as ProfitDealSalesperson[],
      salespersonNames: new Map<string, string>(),
      departmentNames: new Map<string, string>(),
    }),
    [filteredDeals, tradesByDeal]
  );

  const kpi = useMemo(() => {
    return aggregateByDimension("model", filteredCtx).total;
  }, [filteredCtx]);

  const yearAgg = useMemo(
    () => aggregateByDimension("year", filteredCtx),
    [filteredCtx]
  );

  const yearRowsSorted = useMemo(() => {
    const copy = [...yearAgg.rows];
    copy.sort((a, b) => {
      if (yearSortKey === "label") {
        const an = Number(a.key) || 0;
        const bn = Number(b.key) || 0;
        return yearSortDir === "asc" ? an - bn : bn - an;
      }
      const av = a[yearSortKey];
      const bv = b[yearSortKey];
      const an =
        typeof av === "number" && Number.isFinite(av) ? av : -Infinity;
      const bn =
        typeof bv === "number" && Number.isFinite(bv) ? bv : -Infinity;
      return yearSortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [yearAgg.rows, yearSortKey, yearSortDir]);

  type YearCol = {
    key:
      | "label"
      | "volume"
      | "avgFront"
      | "avgBack"
      | "avgTotal"
      | "avgAge"
      | "tradePct";
    label: string;
    format: (r: RollupRow) => string;
    heat?: HeatPolarity;
    numeric?: (r: RollupRow) => number | null;
  };

  const yearCols: YearCol[] = useMemo(
    () => [
      {
        key: "label",
        label: "Year",
        format: (r) => r.label,
      },
      {
        key: "volume",
        label: "Volume",
        format: (r) => pcFmtN(r.volume, 0),
        heat: "higherBetter",
        numeric: (r) => r.volume,
      },
      {
        key: "avgFront",
        label: "Avg front",
        format: (r) => pcFmt$(r.avgFront),
        heat: "higherBetter",
        numeric: (r) => r.avgFront,
      },
      {
        key: "avgBack",
        label: "Avg back",
        format: (r) => pcFmt$(r.avgBack),
        heat: "higherBetter",
        numeric: (r) => r.avgBack,
      },
      {
        key: "avgTotal",
        label: "Avg total",
        format: (r) => pcFmt$(r.avgTotal),
        heat: "higherBetter",
        numeric: (r) => r.avgTotal,
      },
      {
        key: "avgAge",
        label: "Turn",
        format: (r) =>
          r.avgAge == null ? "—" : `${pcFmtN(r.avgAge, 0)}d`,
        heat: "lowerBetter",
        numeric: (r) => r.avgAge,
      },
      {
        key: "tradePct",
        label: "Trade %",
        format: (r) => pcFmtPct(r.tradePct),
        heat: "higherBetter",
        numeric: (r) => r.tradePct,
      },
    ],
    []
  );

  const yearExtents = useMemo(() => {
    const map = new Map<YearCol["key"], { min: number; max: number }>();
    for (const col of yearCols) {
      if (!col.numeric || !col.heat) continue;
      const ext = columnExtent(yearRowsSorted.map((r) => col.numeric!(r)));
      if (ext) map.set(col.key, ext);
    }
    return map;
  }, [yearRowsSorted, yearCols]);

  function toggleYearSort(key: YearCol["key"]) {
    if (yearSortKey === key) {
      setYearSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setYearSortKey(key);
      setYearSortDir(key === "label" ? "desc" : "desc");
    }
  }

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
    () => buildCohortRecommendations(unfilteredCtx, buyBoxSettings, skipDims),
    [unfilteredCtx, buyBoxSettings, skipDims]
  );

  const isModelFocus = focus === "model" && !!make && !!model;

  const storeScorecard = useMemo(() => {
    if (!isModelFocus || !make || !model) return [];
    return buildStoreScorecard({
      deals: filteredDeals,
      trades,
      stores,
      inventoryUnits,
      make,
      model,
      buyBoxSettings,
    });
  }, [
    isModelFocus,
    make,
    model,
    filteredDeals,
    trades,
    stores,
    inventoryUnits,
    buyBoxSettings,
  ]);

  const sweetSpot = useMemo(() => {
    if (!isModelFocus) return { stock: [] as SweetSpotCombo[], avoid: [] as SweetSpotCombo[] };
    return buildSweetSpotCombos({
      deals: filteredDeals,
      trades,
      buyBoxSettings,
    });
  }, [isModelFocus, filteredDeals, trades, buyBoxSettings]);

  const modelInventoryUnits = useMemo(() => {
    if (!isModelFocus || !make || !model) return [] as InvUnitWithStore[];
    return filterModelInventoryUnits(inventoryUnits, make, model);
  }, [isModelFocus, make, model, inventoryUnits]);

  const inventory = useMemo(() => {
    if (!isModelFocus || !make || !model) return null;
    return summarizeModelInventory(
      inventoryUnits,
      make,
      model,
      inventorySnapshotDate
    );
  }, [isModelFocus, make, model, inventoryUnits, inventorySnapshotDate]);

  const invCue =
    inventory && (signal === "buy" || signal === "red")
      ? inventoryBridgeCue(inventory, signal === "buy")
      : inventory && inventory.count > 0
        ? inventoryBridgeCue(inventory, false)
        : null;

  const salesProfile = useMemo(
    () => ({
      bestPriceBandKey: recommendations.bestPriceBandKey,
      worstPriceBandKey: recommendations.worstPriceBandKey,
      bestYearLabel: recommendations.bestYearLabel,
      worstYearLabel: recommendations.worstYearLabel,
    }),
    [recommendations]
  );

  const onLotStoreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of modelInventoryUnits) {
      counts.set(u.store_id, (counts.get(u.store_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name: storeNames.get(id) ?? "Unknown",
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [modelInventoryUnits, storeNames]);

  const onLotScopedUnits = useMemo(() => {
    if (onLotStoreId === "all") return modelInventoryUnits;
    return modelInventoryUnits.filter((u) => u.store_id === onLotStoreId);
  }, [modelInventoryUnits, onLotStoreId]);

  const onLotRated = useMemo(
    () => rateInventoryUnits(onLotScopedUnits, salesProfile),
    [onLotScopedUnits, salesProfile]
  );

  const onLotFiltered = useMemo(() => {
    const base =
      onLotRatingFilter === "all"
        ? onLotRated
        : onLotRated.filter((r) => r.rating === onLotRatingFilter);
    return sortRatedOnLot(base, onLotSortKey, onLotSortDir, storeNames);
  }, [
    onLotRated,
    onLotRatingFilter,
    onLotSortKey,
    onLotSortDir,
    storeNames,
  ]);

  const onLotRatingCounts = useMemo(
    () => ({
      good: onLotRated.filter((r) => r.rating === "good").length,
      bad: onLotRated.filter((r) => r.rating === "bad").length,
      neutral: onLotRated.filter((r) => r.rating === "neutral").length,
    }),
    [onLotRated]
  );

  function toggleOnLotSort(key: OnLotSortKey) {
    if (onLotSortKey === key) {
      setOnLotSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOnLotSortKey(key);
      setOnLotSortDir(key === "stk" || key === "store" ? "asc" : "desc");
    }
  }

  const storeFilterOptions = useMemo(
    () => buildStoreFilterOptions(cohortDeals, storeNames),
    [cohortDeals, storeNames]
  );
  const yearFilterOptions = useMemo(
    () => buildYearFilterOptions(cohortDeals),
    [cohortDeals]
  );
  const trimFilterOptions = useMemo(
    () => buildTrimFilterOptions(cohortDeals),
    [cohortDeals]
  );
  const financeFilterOptions = useMemo(
    () => buildFinanceFilterOptions(cohortDeals),
    [cohortDeals]
  );

  function toggleSort(key: DealSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "store" ||
          key === "stock" ||
          key === "trim" ||
          key === "finance" ||
          key === "sale_date"
          ? "asc"
          : "desc"
      );
    }
  }

  const sortedDeals = useMemo(() => {
    const copy = [...filteredDeals];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey, tradesByDeal, storeNames);
      const bv = sortValue(b, sortKey, tradesByDeal, storeNames);
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
  }, [filteredDeals, sortKey, sortDir, tradesByDeal, storeNames]);

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

  function applySweetSpot(combo: SweetSpotCombo) {
    setDialIn((prev) => ({
      ...prev,
      years: [combo.year],
      trims: [],
      financeTypes: [],
    }));
  }

  function clearDialIn() {
    setDialIn(EMPTY_DIAL_IN);
  }

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
            {filteredDeals.length}
            {filtersActive && filteredDeals.length !== cohortDeals.length
              ? ` of ${cohortDeals.length}`
              : ""}{" "}
            deal{filteredDeals.length === 1 ? "" : "s"}
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

      <div
        className={cn("pc-pill-row", dateLoading && "is-loading")}
        role="group"
        aria-label="Date range"
      >
        {DATE_PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={dateLoading}
            className={cn(
              "pc-pill is-soft",
              preset === opt.value && "is-active"
            )}
            onClick={() => void onPresetChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {dateError && <p className="pc-muted pc-date-error">{dateError}</p>}

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

      {isModelFocus && storeScorecard.length > 0 && (
        <section className="pc-panel">
          <div className="pc-chart-head">
            <div>
              <h3>Store scorecard</h3>
              <p>
                Ranked by buy-box score. Sold vs on-lot shows who needs more or
                has too much of this model.
              </p>
            </div>
          </div>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Sold</th>
                  <th className="text-right">On lot</th>
                  <th className="text-right">Gap</th>
                  <th>Action</th>
                  <th className="text-right">Avg front</th>
                  <th className="text-right">Avg back</th>
                  <th className="text-right">Avg total</th>
                  <th className="text-right">Trade %</th>
                  <th className="text-right">Turn</th>
                </tr>
              </thead>
              <tbody>
                {storeScorecard.map((row) => (
                  <tr
                    key={row.storeId}
                    className={cn(
                      row.isBestScore && "pc-row-best",
                      row.isStrongestNeedMore && "pc-row-need-more",
                      row.isStrongestTooMuch && "pc-row-too-much"
                    )}
                  >
                    <td>
                      {row.storeName}
                      {row.isBestScore ? (
                        <span className="pc-inline-tag">Best</span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {row.score == null
                        ? "—"
                        : pcFmtN(row.score * 100, 0)}
                    </td>
                    <td className="text-right">{row.sold}</td>
                    <td className="text-right">{row.onLot}</td>
                    <td className="text-right">
                      {row.gap > 0 ? `+${row.gap}` : row.gap}
                    </td>
                    <td>
                      <span
                        className={ACTION_META[row.action].chip}
                        title={row.actionWhy}
                      >
                        {ACTION_META[row.action].label}
                      </span>
                    </td>
                    <td className="text-right">{pcFmt$(row.avgFront)}</td>
                    <td className="text-right">{pcFmt$(row.avgBack)}</td>
                    <td className="text-right">{pcFmt$(row.avgTotal)}</td>
                    <td className="text-right">{pcFmtPct(row.tradePct)}</td>
                    <td className="text-right">
                      {row.avgAge == null
                        ? "—"
                        : `${pcFmtN(row.avgAge, 0)}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isModelFocus &&
        (sweetSpot.stock.length > 0 || sweetSpot.avoid.length > 0) && (
          <section className="pc-panel pc-sweet-spot">
            <div className="pc-panel-label">Sweet spot</div>
            <p className="pc-muted">
              Model years ranked by buy-box. Click a year to dial in filters.
            </p>
            {sweetSpot.stock.length > 0 && (
              <div className="pc-sweet-block">
                <h3 className="pc-sweet-stock-label">Stock these</h3>
                <div className="pc-pill-row">
                  {sweetSpot.stock.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="pc-pill is-soft pc-pill-with-count pc-sweet-stock"
                      onClick={() => applySweetSpot(c)}
                      title={`Vol ${c.volume} · avg total ${pcFmt$(c.avgTotal)}`}
                    >
                      <span className="pc-pill-label">{c.label}</span>
                      <span className="pc-filter-count">{c.volume}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sweetSpot.avoid.length > 0 && (
              <div className="pc-sweet-block">
                <h3 className="pc-sweet-avoid-label">Avoid these</h3>
                <div className="pc-pill-row">
                  {sweetSpot.avoid.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="pc-pill is-soft pc-pill-with-count pc-sweet-avoid"
                      onClick={() => applySweetSpot(c)}
                      title={`Vol ${c.volume} · avg total ${pcFmt$(c.avgTotal)}`}
                    >
                      <span className="pc-pill-label">{c.label}</span>
                      <span className="pc-filter-count">{c.volume}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

      <section className="pc-panel">
        <div className="pc-chart-head">
          <div>
            <h3>Deals</h3>
            <p>Click stock # to open the deal. All columns sort high or low.</p>
          </div>
          {filtersActive && (
            <button
              type="button"
              className="pc-pill is-soft"
              onClick={clearDialIn}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="pc-filter-bar">
          <FilterChipGroup
            label="Store"
            options={storeFilterOptions}
            selected={dialIn.storeIds}
            onToggle={(v) =>
              setDialIn((prev) => ({
                ...prev,
                storeIds: toggleInList(prev.storeIds, v),
              }))
            }
          />
          <FilterChipGroup
            label="Year"
            options={yearFilterOptions}
            selected={dialIn.years.map(String)}
            onToggle={(v) => {
              const y = Number(v);
              if (!Number.isFinite(y)) return;
              setDialIn((prev) => ({
                ...prev,
                years: toggleInList(prev.years, y),
              }));
            }}
          />
          <FilterChipGroup
            label="Trim"
            options={trimFilterOptions}
            selected={dialIn.trims}
            onToggle={(v) =>
              setDialIn((prev) => {
                const lower = v.toLowerCase();
                const existing = prev.trims.find(
                  (t) => t.toLowerCase() === lower
                );
                return {
                  ...prev,
                  trims: existing
                    ? prev.trims.filter((t) => t.toLowerCase() !== lower)
                    : [...prev.trims, v],
                };
              })
            }
          />
          <FilterChipGroup
            label="Finance"
            options={financeFilterOptions}
            selected={dialIn.financeTypes}
            onToggle={(v) =>
              setDialIn((prev) => ({
                ...prev,
                financeTypes: toggleInList(prev.financeTypes, v.toLowerCase()),
              }))
            }
          />
        </div>

        {sortedDeals.length === 0 ? (
          <p className="pc-empty">No closed deals in this cut.</p>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <SortHeader
                    label="Store"
                    sortKey="store"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
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
                    label="Finance"
                    sortKey="finance"
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
                      <td>{storeNames.get(d.store_id) ?? "—"}</td>
                      <td>
                        <Link
                          href={`/app/deals/${d.id}/edit`}
                          className="pc-link"
                        >
                          {d.stock_number || "Open"}
                        </Link>
                      </td>
                      <td>{formatSaleDateShort(d.sale_date)}</td>
                      <td>{financeLabel(d.finance_type)}</td>
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

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="pc-chart-head" style={{ padding: "16px 18px 0" }}>
          <div>
            <h3>By year</h3>
            <p>
              Avg front, back, total, turn, and trade % by model year
              {filtersActive ? " (respects dial-in filters above)" : ""}.
            </p>
          </div>
        </div>
        {yearRowsSorted.length === 0 ? (
          <p className="pc-empty" style={{ padding: "12px 18px 18px" }}>
            No closed deals in this cut.
          </p>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  {yearCols.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className="pc-sort"
                        onClick={() => toggleYearSort(col.key)}
                      >
                        {col.label}
                        {yearSortKey === col.key
                          ? yearSortDir === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearRowsSorted.map((row) => (
                  <tr key={row.key}>
                    {yearCols.map((col) => {
                      const ext = yearExtents.get(col.key);
                      const style =
                        col.heat && col.numeric && ext && row.volume > 0
                          ? heatmapStyle(
                              col.numeric(row),
                              ext.min,
                              ext.max,
                              col.heat
                            )
                          : undefined;
                      return (
                        <td
                          key={col.key}
                          style={col.key === "label" ? undefined : style}
                        >
                          {col.format(row)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {yearCols.map((col) => (
                    <td key={col.key}>{col.format(yearAgg.total)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {isModelFocus && (
        <section className="pc-panel pc-inv-bridge">
          <div className="pc-chart-head">
            <div>
              <h3>On lot now</h3>
              <p>
                Current inventory snapshot
                {inventorySnapshotDate
                  ? ` · ${inventorySnapshotDate}`
                  : ""}
                {" — "}
                not tied to the sold date range above. Store pills here only
                filter this table.
              </p>
            </div>
          </div>

          {modelInventoryUnits.length === 0 ? (
            <p className="pc-muted">
              {inventorySnapshotDate
                ? `No matching units on latest snapshot (${inventorySnapshotDate}).`
                : "No recent inventory upload for these stores."}
            </p>
          ) : (
            <>
              {invCue && <p className="pc-inv-cue">{invCue}</p>}

              <div className="pc-filter-group" style={{ marginBottom: 12 }}>
                <span className="pc-filter-group-label">Store</span>
                <div className="pc-pill-row">
                  <button
                    type="button"
                    className={cn(
                      "pc-pill is-soft pc-pill-with-count",
                      onLotStoreId === "all" && "is-active"
                    )}
                    onClick={() => setOnLotStoreId("all")}
                  >
                    <span className="pc-pill-label">All stores</span>
                    <span className="pc-filter-count">
                      {modelInventoryUnits.length}
                    </span>
                  </button>
                  {onLotStoreOptions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={cn(
                        "pc-pill is-soft pc-pill-with-count",
                        onLotStoreId === s.id && "is-active"
                      )}
                      onClick={() => setOnLotStoreId(s.id)}
                    >
                      <span className="pc-pill-label">{s.name}</span>
                      <span className="pc-filter-count">{s.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pc-kpi-grid pc-kpi-grid-compact">
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Units</div>
                  <div className="pc-kpi-value">{onLotScopedUnits.length}</div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Good</div>
                  <div className="pc-kpi-value green">
                    {onLotRatingCounts.good}
                  </div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Neutral</div>
                  <div className="pc-kpi-value">{onLotRatingCounts.neutral}</div>
                </div>
                <div className="pc-kpi">
                  <div className="pc-kpi-label">Bad</div>
                  <div className="pc-kpi-value red">
                    {onLotRatingCounts.bad}
                  </div>
                </div>
              </div>

              <div className="pc-pill-row" style={{ margin: "12px 0" }}>
                {(["all", "good", "neutral", "bad"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={cn(
                      "pc-pill is-soft",
                      onLotRatingFilter === f && "is-active"
                    )}
                    onClick={() => setOnLotRatingFilter(f)}
                  >
                    {f === "all" ? "All ratings" : onLotRatingLabel(f)}
                  </button>
                ))}
              </div>

              {onLotFiltered.length === 0 ? (
                <p className="pc-empty">No units match this filter.</p>
              ) : (
                <div className="pc-table-wrap">
                  <table className="pc-table">
                    <thead>
                      <tr>
                        <th>
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("rating")}
                          >
                            Rating
                            {onLotSortKey === "rating"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("store")}
                          >
                            Store
                            {onLotSortKey === "store"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("stk")}
                          >
                            Stock
                            {onLotSortKey === "stk"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th>Vehicle</th>
                        <th className="text-right">
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("age")}
                          >
                            Age
                            {onLotSortKey === "age"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th className="text-right">
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("cost")}
                          >
                            Cost
                            {onLotSortKey === "cost"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th className="text-right">
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("price")}
                          >
                            Price
                            {onLotSortKey === "price"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th className="text-right">
                          <button
                            type="button"
                            className="pc-sort"
                            onClick={() => toggleOnLotSort("ph")}
                          >
                            Photos
                            {onLotSortKey === "ph"
                              ? onLotSortDir === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onLotFiltered.map(({ unit, rating, reasons }) => {
                        const u = unit as InvUnitWithStore;
                        return (
                          <tr key={`${u.store_id}-${u.stk}`}>
                            <td>
                              <span
                                className={cn(
                                  "pc-buybox-score",
                                  onLotRatingClass(rating)
                                )}
                              >
                                {onLotRatingLabel(rating)}
                              </span>
                            </td>
                            <td>{storeNames.get(u.store_id) ?? "—"}</td>
                            <td>{u.stk}</td>
                            <td>{u.veh ?? "—"}</td>
                            <td className="text-right">
                              {u.age == null
                                ? "—"
                                : `${pcFmtN(u.age, 0)}d`}
                            </td>
                            <td className="text-right">{pcFmt$(u.cost)}</td>
                            <td className="text-right">{pcFmt$(u.price)}</td>
                            <td className="text-right">{u.ph ?? "—"}</td>
                            <td className="pc-muted text-sm">
                              {reasons.join(" · ")}
                            </td>
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
      )}

      <section className="pc-panel pc-dial-in">
        <div className="pc-panel-label">What to stock / what to avoid</div>
        {filtersActive && (
          <p className="pc-muted pc-filter-note">
            Dial-in filters apply to KPIs, stores, and deals above — this
            guidance stays on the full cohort.
          </p>
        )}
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
    </div>
  );
}
