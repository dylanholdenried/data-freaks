/**
 * Build make/model → year → trim sold-vs-stock trees with action buckets.
 */

import {
  modelIdentityKey,
  preferDisplayCasing,
} from "@/lib/profit-center/vehicleIdentity";
import {
  AGED_STOCK_DAYS,
  MIN_OVER_GAP,
  MIN_SOLD_FOR_UNDER,
  MIN_STOCK_ZERO_SALES,
  MIN_UNDER_GAP,
  OVER_COVERAGE,
  UNDER_COVERAGE,
} from "./config";
import type {
  SoldVsStockChildRow,
  SoldVsStockDeal,
  SoldVsStockModelRow,
  SoldVsStockSummary,
  SoldVsStockUnit,
  StockAction,
} from "./types";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function n(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

function mean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

type Acc = {
  makeDisplay: string;
  modelDisplay: string;
  sold: number;
  soldPrior: number;
  onLot: number;
  ages: number[];
  costs: number[];
  fronts: number[];
  backs: number[];
  totals: number[];
  years: Map<string, YearAcc>;
};

type YearAcc = {
  year: number | null;
  label: string;
  sold: number;
  soldPrior: number;
  onLot: number;
  ages: number[];
  costs: number[];
  fronts: number[];
  backs: number[];
  totals: number[];
  trims: Map<string, TrimAcc>;
};

type TrimAcc = {
  trim: string | null;
  label: string;
  sold: number;
  soldPrior: number;
  onLot: number;
  ages: number[];
  costs: number[];
  fronts: number[];
  backs: number[];
  totals: number[];
};

function ensureModel(map: Map<string, Acc>, make: string, model: string): Acc {
  const key = modelIdentityKey(make, model);
  let acc = map.get(key);
  if (!acc) {
    acc = {
      makeDisplay: make.trim() || "Unknown",
      modelDisplay: model.trim() || "Unknown",
      sold: 0,
      soldPrior: 0,
      onLot: 0,
      ages: [],
      costs: [],
      fronts: [],
      backs: [],
      totals: [],
      years: new Map(),
    };
    map.set(key, acc);
  } else {
    acc.makeDisplay = preferDisplayCasing(acc.makeDisplay, make);
    acc.modelDisplay = preferDisplayCasing(acc.modelDisplay, model);
  }
  return acc;
}

function ensureYear(acc: Acc, year: number | null): YearAcc {
  const key = year == null || !Number.isFinite(year) ? "__unknown" : String(year);
  let y = acc.years.get(key);
  if (!y) {
    y = {
      year: year != null && Number.isFinite(year) ? year : null,
      label: year != null && Number.isFinite(year) ? String(year) : "Unknown year",
      sold: 0,
      soldPrior: 0,
      onLot: 0,
      ages: [],
      costs: [],
      fronts: [],
      backs: [],
      totals: [],
      trims: new Map(),
    };
    acc.years.set(key, y);
  }
  return y;
}

function ensureTrim(y: YearAcc, trim: string | null): TrimAcc {
  const raw = (trim ?? "").trim();
  const key = raw ? norm(raw) : "__none";
  let t = y.trims.get(key);
  if (!t) {
    t = {
      trim: raw || null,
      label: raw || "No trim",
      sold: 0,
      soldPrior: 0,
      onLot: 0,
      ages: [],
      costs: [],
      fronts: [],
      backs: [],
      totals: [],
    };
    y.trims.set(key, t);
  } else if (raw) {
    t.label = preferDisplayCasing(t.label === "No trim" ? raw : t.label, raw);
    t.trim = t.trim ? preferDisplayCasing(t.trim, raw) : raw;
  }
  return t;
}

function pushDealMetrics(
  target: { fronts: number[]; backs: number[]; totals: number[] },
  deal: SoldVsStockDeal
): void {
  if (deal.front_profit != null && Number.isFinite(deal.front_profit)) {
    target.fronts.push(deal.front_profit);
  }
  if (deal.back_profit != null && Number.isFinite(deal.back_profit)) {
    target.backs.push(deal.back_profit);
  }
  if (deal.front_profit != null || deal.back_profit != null) {
    target.totals.push(n(deal.front_profit) + n(deal.back_profit));
  }
}

function pushUnitMetrics(
  target: { onLot: number; ages: number[]; costs: number[] },
  unit: SoldVsStockUnit
): void {
  target.onLot += 1;
  if (unit.age != null && Number.isFinite(unit.age)) target.ages.push(unit.age);
  if (unit.cost != null && Number.isFinite(unit.cost)) target.costs.push(unit.cost);
}

export function classifyAction(input: {
  sold: number;
  onLot: number;
  avgAge: number | null;
}): { action: StockAction; why: string; urgency: number } {
  const { sold, onLot, avgAge } = input;
  const gap = sold - onLot;
  const coverage = sold > 0 ? onLot / sold : onLot > 0 ? Infinity : null;
  const aged =
    avgAge != null && avgAge >= AGED_STOCK_DAYS
      ? ` · avg age ${Math.round(avgAge)}d`
      : "";

  // Hot buy: sells, nothing on lot
  if (sold >= 1 && onLot === 0) {
    return {
      action: "need_more",
      why: `Sold ${sold}, 0 on lot — stocked out vs your rooftop demand.`,
      urgency: 1000 + sold * 10,
    };
  }

  // Clear understock vs sales pace
  if (
    sold >= MIN_SOLD_FOR_UNDER &&
    (gap >= MIN_UNDER_GAP || (coverage != null && coverage < UNDER_COVERAGE))
  ) {
    return {
      action: "need_more",
      why: `Sold ${sold}, ${onLot} on lot — short ${gap} vs sales (coverage ${coverage!.toFixed(1)}x).`,
      urgency: 500 + gap * 20 + sold,
    };
  }

  // Dead stock / no sales
  if (sold === 0 && onLot >= MIN_STOCK_ZERO_SALES) {
    const ageBoost = avgAge != null && avgAge >= AGED_STOCK_DAYS ? 50 : 0;
    return {
      action: "too_much",
      why: `0 sold, ${onLot} on lot — no retail demand in window${aged}.`,
      urgency: 400 + onLot * 15 + ageBoost,
    };
  }

  // Overstocked relative to sales
  if (
    sold > 0 &&
    coverage != null &&
    coverage > OVER_COVERAGE &&
    onLot - sold >= MIN_OVER_GAP
  ) {
    const excess = onLot - sold;
    const ageBoost = avgAge != null && avgAge >= AGED_STOCK_DAYS ? 40 : 0;
    return {
      action: "too_much",
      why: `Sold ${sold}, ${onLot} on lot — ${excess} over sales pace (coverage ${coverage.toFixed(1)}x)${aged}.`,
      urgency: 300 + excess * 12 + ageBoost,
    };
  }

  // Thin signal
  if (sold < MIN_SOLD_FOR_UNDER && onLot < MIN_STOCK_ZERO_SALES) {
    return {
      action: "watch",
      why:
        sold === 0 && onLot === 0
          ? "No sales and no stock in window."
          : `Sold ${sold}, ${onLot} on lot — low volume; watch before acting.`,
      urgency: sold + onLot,
    };
  }

  return {
    action: "balanced",
    why: `Sold ${sold}, ${onLot} on lot — roughly matched to rooftop sales${
      coverage != null && Number.isFinite(coverage)
        ? ` (${coverage.toFixed(1)}x coverage)`
        : ""
    }.`,
    urgency: Math.abs(gap),
  };
}

function daysToStockout(
  onLot: number,
  sold: number,
  windowDays: number
): number | null {
  if (onLot <= 0) return 0;
  if (sold <= 0 || windowDays <= 0) return null;
  const perDay = sold / windowDays;
  if (perDay <= 0) return null;
  return onLot / perDay;
}

function finalizeLeaf(
  key: string,
  label: string,
  year: number | null,
  trim: string | null,
  sold: number,
  soldPrior: number,
  onLot: number,
  ages: number[],
  costs: number[],
  fronts: number[],
  backs: number[],
  totals: number[],
  windowDays: number,
  children?: SoldVsStockChildRow[]
): SoldVsStockChildRow {
  const avgAge = mean(ages);
  const { action, why } = classifyAction({ sold, onLot, avgAge });
  return {
    key,
    label,
    year,
    trim,
    sold,
    soldPrior,
    onLot,
    avgAge,
    maxAge: ages.length ? Math.max(...ages) : null,
    over45: ages.filter((a) => a >= AGED_STOCK_DAYS).length,
    totalCost: costs.reduce((s, c) => s + c, 0),
    avgFront: mean(fronts),
    avgBack: mean(backs),
    avgTotal: mean(totals),
    coverage: sold > 0 ? onLot / sold : null,
    gap: sold - onLot,
    daysToStockout: daysToStockout(onLot, sold, windowDays),
    velocityDelta: sold - soldPrior,
    action,
    why,
    children,
  };
}

export function buildSoldVsStockRows(opts: {
  deals: SoldVsStockDeal[];
  priorDeals: SoldVsStockDeal[];
  units: SoldVsStockUnit[];
  storeIds: string[] | "all";
  windowDays: number;
}): { rows: SoldVsStockModelRow[]; summary: SoldVsStockSummary } {
  const storeFilter =
    opts.storeIds === "all"
      ? null
      : new Set(opts.storeIds);

  const deals = storeFilter
    ? opts.deals.filter((d) => storeFilter.has(d.store_id))
    : opts.deals;
  const priorDeals = storeFilter
    ? opts.priorDeals.filter((d) => storeFilter.has(d.store_id))
    : opts.priorDeals;
  const units = storeFilter
    ? opts.units.filter((u) => storeFilter.has(u.store_id))
    : opts.units;

  const map = new Map<string, Acc>();

  for (const d of deals) {
    const make = d.vehicle_make?.trim() || "Unknown";
    const model = d.vehicle_model?.trim() || "Unknown";
    const acc = ensureModel(map, make, model);
    acc.sold += 1;
    pushDealMetrics(acc, d);
    const y = ensureYear(acc, d.vehicle_year);
    y.sold += 1;
    pushDealMetrics(y, d);
    const t = ensureTrim(y, d.trim);
    t.sold += 1;
    pushDealMetrics(t, d);
  }

  for (const d of priorDeals) {
    const make = d.vehicle_make?.trim() || "Unknown";
    const model = d.vehicle_model?.trim() || "Unknown";
    const acc = ensureModel(map, make, model);
    acc.soldPrior += 1;
    const y = ensureYear(acc, d.vehicle_year);
    y.soldPrior += 1;
    const t = ensureTrim(y, d.trim);
    t.soldPrior += 1;
  }

  for (const u of units) {
    // Skip wholesale disposition when present — focus retail lot for stocking.
    if (norm(u.disp) === "wholesale") continue;
    const make = u.make?.trim() || "Unknown";
    const model = u.model?.trim() || "Unknown";
    if (!u.make && !u.model) continue;
    const acc = ensureModel(map, make, model);
    pushUnitMetrics(acc, u);
    const y = ensureYear(acc, u.year);
    pushUnitMetrics(y, u);
    const t = ensureTrim(y, u.trim);
    pushUnitMetrics(t, u);
  }

  const rows: SoldVsStockModelRow[] = [];

  for (const [key, acc] of map) {
    const avgAge = mean(acc.ages);
    const { action, why, urgency } = classifyAction({
      sold: acc.sold,
      onLot: acc.onLot,
      avgAge,
    });

    const marginBoost =
      mean(acc.totals) != null && mean(acc.totals)! > 0
        ? Math.min(80, mean(acc.totals)! / 50)
        : 0;
    const velocityBoost =
      acc.sold > acc.soldPrior ? (acc.sold - acc.soldPrior) * 5 : 0;
    const ageBoost =
      action === "too_much" && avgAge != null && avgAge >= AGED_STOCK_DAYS
        ? 30
        : 0;

    const years: SoldVsStockChildRow[] = [...acc.years.entries()]
      .map(([yKey, y]) => {
        const trims = [...y.trims.entries()]
          .map(([tKey, t]) =>
            finalizeLeaf(
              `${key}::${yKey}::${tKey}`,
              t.label,
              y.year,
              t.trim,
              t.sold,
              t.soldPrior,
              t.onLot,
              t.ages,
              t.costs,
              t.fronts,
              t.backs,
              t.totals,
              opts.windowDays
            )
          )
          .sort((a, b) => b.sold - a.sold || b.onLot - a.onLot);

        return finalizeLeaf(
          `${key}::${yKey}`,
          y.label,
          y.year,
          null,
          y.sold,
          y.soldPrior,
          y.onLot,
          y.ages,
          y.costs,
          y.fronts,
          y.backs,
          y.totals,
          opts.windowDays,
          trims
        );
      })
      .sort((a, b) => {
        const ay = a.year ?? 0;
        const by = b.year ?? 0;
        return by - ay;
      });

    rows.push({
      key,
      make: acc.makeDisplay,
      model: acc.modelDisplay,
      label: `${acc.makeDisplay} ${acc.modelDisplay}`.trim(),
      sold: acc.sold,
      soldPrior: acc.soldPrior,
      onLot: acc.onLot,
      avgAge,
      maxAge: acc.ages.length ? Math.max(...acc.ages) : null,
      over45: acc.ages.filter((a) => a >= AGED_STOCK_DAYS).length,
      totalCost: acc.costs.reduce((s, c) => s + c, 0),
      avgFront: mean(acc.fronts),
      avgBack: mean(acc.backs),
      avgTotal: mean(acc.totals),
      coverage: acc.sold > 0 ? acc.onLot / acc.sold : null,
      gap: acc.sold - acc.onLot,
      daysToStockout: daysToStockout(acc.onLot, acc.sold, opts.windowDays),
      velocityDelta: acc.sold - acc.soldPrior,
      action,
      why,
      urgency: urgency + marginBoost + velocityBoost + ageBoost,
      years,
    });
  }

  rows.sort((a, b) => {
    const order = { need_more: 0, too_much: 1, balanced: 2, watch: 3 };
    const ao = order[a.action];
    const bo = order[b.action];
    if (ao !== bo) return ao - bo;
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return b.sold - a.sold;
  });

  const summary: SoldVsStockSummary = {
    models: rows.length,
    sold: rows.reduce((s, r) => s + r.sold, 0),
    onLot: rows.reduce((s, r) => s + r.onLot, 0),
    needMore: rows.filter((r) => r.action === "need_more").length,
    tooMuch: rows.filter((r) => r.action === "too_much").length,
    balanced: rows.filter((r) => r.action === "balanced").length,
    watch: rows.filter((r) => r.action === "watch").length,
    snapshotDate: null,
  };

  return { rows, summary };
}

export function filterRowsByAction(
  rows: SoldVsStockModelRow[],
  action: StockAction | "all"
): SoldVsStockModelRow[] {
  if (action === "all") return rows;
  return rows.filter((r) => r.action === action);
}