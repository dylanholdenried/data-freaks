/**
 * Acquire Performance analytics — purchase-card economics only.
 * Buy-box scoring reuses Profit Center's scoreBuyBox via RollupRow adapters.
 */

import { daysBetween, effectiveGross, num } from "./cost";
import {
  ACQ_EXIT_STRATEGIES,
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_LABELS,
  ACQ_SOURCE_TYPES,
  type AcqExitStrategy,
  type AcqPurchase,
  type AcqSourceType,
} from "./types";
import type { DatePreset, DateRange } from "@/lib/profit-center/dateRange";
import type { RollupRow } from "@/lib/profit-center/aggregate";
import { sameMake, sameModel } from "@/lib/profit-center/vehicleIdentity";
import { storesQueryString } from "@/lib/acquire/store-labels";

export const ACQUIRE_PERF_TABS = [
  { id: "overview", label: "Overview" },
  { id: "buy-box", label: "Buy-Box" },
  { id: "sources", label: "Sources" },
  { id: "purchases", label: "Purchases" },
] as const;

export type AcquirePerfTabId = (typeof ACQUIRE_PERF_TABS)[number]["id"];

export function parseAcquirePerfTab(
  raw: string | undefined | null
): AcquirePerfTabId {
  if (
    raw === "buy-box" ||
    raw === "sources" ||
    raw === "purchases" ||
    raw === "overview"
  ) {
    return raw;
  }
  return "overview";
}

/** Cohort drill-down for a make/model (Acquire purchases only). */
export function acquireModelCohortHref(
  make: string,
  model: string,
  opts?: {
    preset?: DatePreset | string;
    storeIds?: string[];
    allStoreIds?: string[];
  }
): string {
  const q = new URLSearchParams();
  q.set("make", make);
  q.set("model", model);
  if (opts?.preset && opts.preset !== "mtd") q.set("preset", opts.preset);
  if (opts?.storeIds && opts?.allStoreIds) {
    const storesQs = storesQueryString(opts.storeIds, opts.allStoreIds);
    if (storesQs) {
      // storesQs is "stores=id1,id2" — append without duplicating key
      const raw = storesQs.slice("stores=".length);
      if (raw) q.set("stores", raw);
    }
  }
  return `/app/acquire/performance/cohort?${q.toString()}`;
}

export function purchaseMatchesMakeModel(
  p: Pick<AcqPurchase, "vehicle_make" | "vehicle_model">,
  make?: string | null,
  model?: string | null
): boolean {
  const wantMake = make?.trim() ? make : undefined;
  const wantModel = model?.trim() ? model : undefined;
  if (wantMake && !sameMake(p.vehicle_make ?? "", wantMake)) return false;
  if (wantModel && !sameModel(p.vehicle_model ?? "", wantModel)) return false;
  return Boolean(wantMake || wantModel);
}

/** Resolve make/model from a buy-box row key (`MAKE|MODEL`) or label. */
export function makeModelFromBuyBoxRow(
  row: { key: string; label: string },
  catalog: { key: string; make: string; model: string; label: string }[]
): { make: string; model: string } {
  const fromCatalog = catalog.find(
    (c) => c.key === row.key || c.label === row.label
  );
  if (fromCatalog) return { make: fromCatalog.make, model: fromCatalog.model };

  const pipe = row.key.indexOf("|");
  if (pipe > 0) {
    return {
      make: row.key.slice(0, pipe),
      model: row.key.slice(pipe + 1),
    };
  }
  const parts = row.label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { make: parts[0]!, model: parts.slice(1).join(" ") };
  }
  return { make: row.label.trim(), model: "" };
}

export function acquirePerformanceHref(opts?: {
  preset?: DatePreset | string;
  storeIds?: string[];
  allStoreIds?: string[];
  tab?: AcquirePerfTabId;
}): string {
  const parts: string[] = [];
  if (opts?.storeIds && opts?.allStoreIds) {
    const storesQs = storesQueryString(opts.storeIds, opts.allStoreIds);
    if (storesQs) parts.push(storesQs);
  }
  if (opts?.preset && opts.preset !== "mtd") {
    parts.push(`preset=${opts.preset}`);
  }
  if (opts?.tab && opts.tab !== "overview") {
    parts.push(`tab=${opts.tab}`);
  }
  return parts.length
    ? `/app/acquire/performance?${parts.join("&")}`
    : "/app/acquire/performance";
}

export function isSoldPurchase(p: AcqPurchase): boolean {
  return p.stage === "sold" || p.stage === "arbitration_complete";
}

export function exitOf(p: AcqPurchase): AcqExitStrategy | null {
  const v = p.exit_strategy;
  if (v && (ACQ_EXIT_STRATEGIES as readonly string[]).includes(v)) {
    return v as AcqExitStrategy;
  }
  if (v === "retail") return "prime";
  if (v === "wholesale_sold") return "wholesale";
  return null;
}

export function isRetailLike(exit: AcqExitStrategy | null): boolean {
  return exit === "prime" || exit === "subprime" || exit === "cash";
}

export function isWholesaleExit(exit: AcqExitStrategy | null): boolean {
  return exit === "wholesale";
}

/** Seller display key — free-text from the purchase card. */
export function sellerKey(p: AcqPurchase): string {
  const name = (p.seller_name ?? p.auction_house ?? "").trim();
  return name || "(Unknown)";
}

export function turnDays(p: AcqPurchase): number | null {
  return daysBetween(p.purchase_date, p.sold_date);
}

export function frontOf(p: AcqPurchase): number | null {
  return p.front_gross != null ? Number(p.front_gross) : null;
}

export function backOf(p: AcqPurchase): number | null {
  return p.back_gross != null ? Number(p.back_gross) : null;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function inSoldDateRange(p: AcqPurchase, range: DateRange): boolean {
  const d = p.sold_date;
  if (!d) return false;
  return d >= range.from && d <= range.to;
}

/** Sold units in store scope + sold_date range. */
export function filterSoldInRange(
  purchases: AcqPurchase[],
  range: DateRange
): AcqPurchase[] {
  return purchases.filter((p) => isSoldPurchase(p) && inSoldDateRange(p, range));
}

export type ReconStats = {
  reconCount: number;
  totalRecon: number;
  avgRecon: number | null;
  comparedCount: number;
  avgEstimate: number | null;
  avgActualCompared: number | null;
  avgVariance: number | null;
  avgVariancePct: number | null;
  overCount: number;
  underCount: number;
};

export function computeReconStats(list: AcqPurchase[]): ReconStats {
  const actuals = list
    .filter((p) => p.recon_cost != null)
    .map((p) => num(p.recon_cost));
  const compared = list.filter(
    (p) => p.recon_cost != null && p.recon_estimate != null
  );
  const estimates = compared.map((p) => num(p.recon_estimate));
  const comparedActuals = compared.map((p) => num(p.recon_cost));
  const variances = compared.map(
    (p) => num(p.recon_cost) - num(p.recon_estimate)
  );
  const variancePcts = compared
    .filter((p) => num(p.recon_estimate) > 0)
    .map(
      (p) => (num(p.recon_cost) - num(p.recon_estimate)) / num(p.recon_estimate)
    );
  return {
    reconCount: actuals.length,
    totalRecon: actuals.reduce((a, b) => a + b, 0),
    avgRecon: avg(actuals),
    comparedCount: compared.length,
    avgEstimate: avg(estimates),
    avgActualCompared: avg(comparedActuals),
    avgVariance: avg(variances),
    avgVariancePct: avg(variancePcts),
    overCount: variances.filter((v) => v > 0).length,
    underCount: variances.filter((v) => v < 0).length,
  };
}

/**
 * KPI rollup for a cohort of sold purchases.
 * Retail averages exclude wholesale / transfer / arbitrated so WS doesn't drag them.
 */
export type AcqKpiRollup = {
  key: string;
  label: string;
  soldCount: number;
  retailCount: number;
  wholesaleCount: number;
  transferCount: number;
  arbCount: number;
  /** wholesaleCount / soldCount as 0–100 */
  wholesalePct: number | null;
  front: number;
  back: number;
  total: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgTurn: number | null;
  tradeCount: number;
  tradePct: number | null;
  wholesaleTotalGross: number;
  avgWholesaleGross: number | null;
  recon: ReconStats;
};

export function emptyKpiRollup(key: string, label: string): AcqKpiRollup {
  return {
    key,
    label,
    soldCount: 0,
    retailCount: 0,
    wholesaleCount: 0,
    transferCount: 0,
    arbCount: 0,
    wholesalePct: null,
    front: 0,
    back: 0,
    total: 0,
    avgFront: null,
    avgBack: null,
    avgTotal: null,
    avgTurn: null,
    tradeCount: 0,
    tradePct: null,
    wholesaleTotalGross: 0,
    avgWholesaleGross: null,
    recon: computeReconStats([]),
  };
}

export function rollupSold(key: string, label: string, sold: AcqPurchase[]): AcqKpiRollup {
  const retail = sold.filter((p) => isRetailLike(exitOf(p)));
  const wholesale = sold.filter((p) => isWholesaleExit(exitOf(p)));
  const transfer = sold.filter((p) => exitOf(p) === "internal_transfer");
  const arb = sold.filter((p) => exitOf(p) === "arbitrated");

  const fronts = retail.map(frontOf).filter((x): x is number => x != null);
  const backs = retail.map(backOf).filter((x): x is number => x != null);
  const totals = retail
    .map((p) => effectiveGross(p))
    .filter((x): x is number => x != null);
  const turns = retail
    .map(turnDays)
    .filter((x): x is number => x != null);
  const tradeCount = retail.filter((p) => p.has_trade).length;

  const wsGrosses = wholesale
    .map((p) => effectiveGross(p))
    .filter((x): x is number => x != null);

  const frontSum = fronts.reduce((a, b) => a + b, 0);
  const backSum = backs.reduce((a, b) => a + b, 0);
  const totalSum = totals.reduce((a, b) => a + b, 0);

  return {
    key,
    label,
    soldCount: sold.length,
    retailCount: retail.length,
    wholesaleCount: wholesale.length,
    transferCount: transfer.length,
    arbCount: arb.length,
    wholesalePct: sold.length ? (wholesale.length / sold.length) * 100 : null,
    front: frontSum,
    back: backSum,
    total: totalSum,
    avgFront: avg(fronts),
    avgBack: avg(backs),
    avgTotal: avg(totals),
    avgTurn: avg(turns),
    tradeCount,
    tradePct: retail.length ? (tradeCount / retail.length) * 100 : null,
    wholesaleTotalGross: wsGrosses.reduce((a, b) => a + b, 0),
    avgWholesaleGross: avg(wsGrosses),
    recon: computeReconStats(sold),
  };
}

/** Map retail-like sold cohort → Profit Center RollupRow for scoreBuyBox. */
export function toBuyBoxRollupRow(kpi: AcqKpiRollup): RollupRow {
  return {
    key: kpi.key,
    label: kpi.label,
    volume: kpi.retailCount,
    front: kpi.front,
    back: kpi.back,
    total: kpi.total,
    avgFront: kpi.avgFront,
    avgBack: kpi.avgBack,
    avgTotal: kpi.avgTotal,
    avgAge: kpi.avgTurn,
    avgSalePrice: null,
    trades: kpi.tradeCount,
    tradePct: kpi.tradePct,
    primePct: null,
    subprimePct: null,
    cashPct: null,
    avgLostGross: null,
    avgTradeHold: null,
  };
}

export type ModelKpiRow = AcqKpiRollup & {
  make: string;
  model: string;
};

export function rollupByModel(sold: AcqPurchase[]): ModelKpiRow[] {
  const map = new Map<string, AcqPurchase[]>();
  for (const p of sold) {
    const make = (p.vehicle_make ?? "").trim() || "Unknown";
    const model = (p.vehicle_model ?? "").trim() || "Unknown";
    const key = `${make.toUpperCase()}|${model.toUpperCase()}`;
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const make = list[0]?.vehicle_make?.trim() || "Unknown";
      const model = list[0]?.vehicle_model?.trim() || "Unknown";
      const base = rollupSold(key, `${make} ${model}`, list);
      return { ...base, make, model };
    })
    .sort((a, b) => b.retailCount - a.retailCount || a.label.localeCompare(b.label));
}

export type SourceTreeRow = AcqKpiRollup & {
  source_type: AcqSourceType;
  sellers: AcqKpiRollup[];
};

export function rollupBySourceTree(sold: AcqPurchase[]): SourceTreeRow[] {
  const bySource = new Map<AcqSourceType, AcqPurchase[]>();
  for (const p of sold) {
    const list = bySource.get(p.source_type) ?? [];
    list.push(p);
    bySource.set(p.source_type, list);
  }

  const orderedTypes = ACQ_SOURCE_TYPES.filter((t) => bySource.has(t));
  // Include any unexpected source_type values
  for (const t of bySource.keys()) {
    if (!orderedTypes.includes(t)) orderedTypes.push(t);
  }

  return orderedTypes.map((source_type) => {
    const list = bySource.get(source_type) ?? [];
    const parent = rollupSold(
      source_type,
      ACQ_SOURCE_LABELS[source_type] ?? source_type,
      list
    );

    const bySeller = new Map<string, AcqPurchase[]>();
    for (const p of list) {
      const sk = sellerKey(p);
      const sellerList = bySeller.get(sk) ?? [];
      sellerList.push(p);
      bySeller.set(sk, sellerList);
    }

    const sellers = Array.from(bySeller.entries())
      .map(([sk, sellerList]) =>
        rollupSold(`${source_type}::${sk.toLowerCase()}`, sk, sellerList)
      )
      .sort(
        (a, b) =>
          b.soldCount - a.soldCount || a.label.localeCompare(b.label)
      );

    return {
      ...parent,
      source_type,
      sellers,
    };
  });
}

export type ExitMixRow = {
  strategy: AcqExitStrategy;
  label: string;
  count: number;
  avgGross: number | null;
};

export function exitMix(sold: AcqPurchase[]): ExitMixRow[] {
  return ACQ_EXIT_STRATEGIES.map((strategy) => {
    const subset = sold.filter((p) => exitOf(p) === strategy);
    const g = subset
      .map((p) => effectiveGross(p))
      .filter((x): x is number => x != null);
    return {
      strategy,
      label: ACQ_EXIT_STRATEGY_LABELS[strategy],
      count: subset.length,
      avgGross: avg(g),
    };
  });
}

export type OverviewSnapshot = {
  totalSold: number;
  all: AcqKpiRollup;
  retail: AcqKpiRollup;
  wholesale: AcqKpiRollup;
  exitMix: ExitMixRow[];
  byMake: AcqKpiRollup[];
};

export function buildOverview(sold: AcqPurchase[]): OverviewSnapshot {
  const retailUnits = sold.filter((p) => isRetailLike(exitOf(p)));
  const wholesaleUnits = sold.filter((p) => isWholesaleExit(exitOf(p)));

  const makeMap = new Map<string, AcqPurchase[]>();
  for (const p of retailUnits) {
    const make = (p.vehicle_make ?? "").trim() || "Unknown";
    const key = make.toUpperCase();
    const list = makeMap.get(key) ?? [];
    list.push(p);
    makeMap.set(key, list);
  }
  const byMake = Array.from(makeMap.entries())
    .map(([key, list]) =>
      rollupSold(key, list[0]?.vehicle_make?.trim() || "Unknown", list)
    )
    .sort((a, b) => b.retailCount - a.retailCount);

  return {
    totalSold: sold.length,
    all: rollupSold("all", "All sold", sold),
    retail: rollupSold("retail", "Retail-like", retailUnits),
    wholesale: rollupSold("wholesale", "Wholesale", wholesaleUnits),
    exitMix: exitMix(sold),
    byMake,
  };
}
