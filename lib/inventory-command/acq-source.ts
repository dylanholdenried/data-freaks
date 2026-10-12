/** Acquisition source tagging for inventory units + per-source health / sold aggregation. */

import {
  filterAcquisitionSourcesForDepartment,
  type AcquisitionSourceDepartmentLink,
  type AcquisitionSourceOption,
} from "@/lib/acquisition-sources";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import { isHotUnit, parseDateOnly } from "./compute";
import { FULL_PHOTO_COUNT, STALE_DAYS } from "./config";
import { AGE_BUCKETS, ageBucket, type AgeBucket } from "./midmo";
import type { InvMovement, InvUnitDetailRow } from "./types";

export const SOURCE_NEW_TRADE = "New Car Trade";
export const SOURCE_USED_TRADE = "Used Car Trade";
export const SOURCE_DYLAN = "Dylan Purchase";

/** Group key for units/deals without a source. */
export const NO_SOURCE_KEY = "__none";

export type AcqSourceOrigin = "manual" | "auto";

export type AutoSourceResult = {
  source: string | null;
  /** Why the unit was left blank, when a rule deliberately defers to manual entry. */
  note: string | null;
};

export function normStk(stk: string | null | undefined): string {
  return (stk ?? "").trim().toUpperCase();
}

/** Stock-number rules. Order matters: the first match wins. */
export function autoSourceForStock(stk: string | null | undefined): AutoSourceResult {
  const s = normStk(stk);
  if (!s) return { source: null, note: null };

  // 6 digits (optionally prefixed with C) + A / AA = new car trade; any other letters = used car trade.
  if (/^C?\d{6}A{1,2}$/.test(s)) return { source: SOURCE_NEW_TRADE, note: null };
  if (/^C?\d{6}[A-Z]+$/.test(s)) return { source: SOURCE_USED_TRADE, note: null };

  if (/^DH[A-Z]*\d{4}$/.test(s)) return { source: SOURCE_DYLAN, note: null };
  if (/^DH.*[A-Z]$/.test(s)) return { source: SOURCE_USED_TRADE, note: null };

  if (/^CP.*\d{4}$/.test(s)) {
    return { source: null, note: "CP purchase: multiple sources, tag manually" };
  }
  if (/^CP.*[A-Z]$/.test(s)) return { source: SOURCE_USED_TRADE, note: null };

  if (/^\d{4}[A-Z]+$/.test(s)) return { source: SOURCE_USED_TRADE, note: null };
  if (/^\d{4}$/.test(s)) {
    return { source: null, note: "4-digit stock: multiple sources, tag manually" };
  }

  return { source: null, note: null };
}

export type ResolvedAcqSource = {
  source: string | null;
  origin: AcqSourceOrigin | null;
  note: string | null;
};

/**
 * Manual tag wins forever; otherwise the stock-number rule, but only when that name
 * exists in the store's source list (an empty list accepts any rule result).
 */
export function resolveAcqSource(
  stk: string | null | undefined,
  manualByStk: Map<string, string>,
  storeSourceNames: string[]
): ResolvedAcqSource {
  const manual = manualByStk.get(normStk(stk));
  if (manual) return { source: manual, origin: "manual", note: null };

  const auto = autoSourceForStock(stk);
  if (!auto.source) return { source: null, origin: null, note: auto.note };
  if (storeSourceNames.length === 0) return { source: auto.source, origin: "auto", note: null };

  const match = storeSourceNames.find(
    (n) => n.trim().toLowerCase() === auto.source!.toLowerCase()
  );
  if (!match) {
    return {
      source: null,
      origin: null,
      note: `Rule says "${auto.source}" but it is not in this store's source list`,
    };
  }
  return { source: match, origin: "auto", note: null };
}

export function manualTagMap(tags: { stk: string; source: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tags) map.set(normStk(t.stk), t.source);
  return map;
}

/** Pre-Owned department sources for a store, same fallback as the deal form. */
export function preOwnedSourceNames(
  allSources: AcquisitionSourceOption[],
  links: AcquisitionSourceDepartmentLink[],
  departments: { id: string; name: string }[]
): string[] {
  const preOwned = departments.find((d) => isPreOwnedDepartment(d.name));
  const list = preOwned
    ? filterAcquisitionSourcesForDepartment(
        allSources,
        links,
        preOwned.id,
        departments.map((d) => d.id)
      )
    : allSources.filter((s) => s.active !== false);
  return [...new Set(list.map((s) => s.name))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type TaggedUnit = InvUnitDetailRow & {
  storeId: string;
  storeName: string;
  snapshotDate: string;
  source: string | null;
  sourceOrigin: AcqSourceOrigin | null;
  sourceNote: string | null;
};

export type TaggedMovement = InvMovement & { source: string | null };

export type SoldDeal = {
  store_id: string;
  stock_number: string | null;
  sale_date: string;
  acquisition_source: string | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_price: number | null;
  age: number | null;
};

export type SourceHealthRow = {
  key: string;
  label: string;
  storeId: string | null;
  storeName: string | null;
  units: number;
  pctOfStock: number | null;
  totalCost: number;
  avgCost: number | null;
  avgPrice: number | null;
  avgMarkup: number | null;
  markupPct: number | null;
  avgPom: number | null;
  avgCtm: number | null;
  avgMmrSpread: number | null;
  avgJdSpread: number | null;
  avgBbSpread: number | null;
  avgOdometer: number | null;
  avgAge: number | null;
  buckets: Record<AgeBucket, number>;
  pctOver60: number | null;
  hot: number;
  noPrice: number;
  photoGaps: number;
  stale: number;
  avgSpd: number | null;
  vdpConv: number | null;
  retail: number;
  subprime: number;
  wholesale: number;
  arrivals30: number;
  exits30: number;
  avgExitAge: number | null;
  sold: number;
  daysSupply: number | null;
  soldToStock: number | null;
};

export type SoldResultRow = {
  key: string;
  label: string;
  storeId: string | null;
  storeName: string | null;
  sold: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgSalePrice: number | null;
  avgAgeAtSale: number | null;
  totalGross: number;
};

function avg(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length === 0) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

function sourceKey(source: string | null | undefined): string {
  const s = source?.trim();
  return s ? s.toLowerCase() : NO_SOURCE_KEY;
}

function groupKey(source: string | null | undefined, storeId: string | null): string {
  return storeId ? `${sourceKey(source)}::${storeId}` : sourceKey(source);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (parseDateOnly(toIso).getTime() - parseDateOnly(fromIso).getTime()) / 86_400_000
  );
}

export function withinDays(dateIso: string, asOfIso: string, days: number): boolean {
  const d = daysBetween(dateIso.slice(0, 10), asOfIso);
  return d >= 0 && d < days;
}

type HealthOpts = {
  movements: TaggedMovement[];
  sold: SoldDeal[];
  soldWindowDays: number;
  /** Latest snapshot date per store; anchors the 30-day movement and sold windows. */
  asOfByStore: Record<string, string>;
  splitByStore: boolean;
  storeNames: Record<string, string>;
};

export function buildSourceHealth(
  units: TaggedUnit[],
  opts: HealthOpts
): { rows: SourceHealthRow[]; total: SourceHealthRow } {
  const totalUnits = units.length;
  const groups = new Map<
    string,
    { label: string; storeId: string | null; units: TaggedUnit[] }
  >();
  const labelFor = (source: string | null) => source?.trim() || "Untagged";

  const ensure = (source: string | null, storeId: string | null) => {
    const k = groupKey(source, opts.splitByStore ? storeId : null);
    let g = groups.get(k);
    if (!g) {
      g = { label: labelFor(source), storeId: opts.splitByStore ? storeId : null, units: [] };
      groups.set(k, g);
    }
    return { k, g };
  };

  for (const u of units) ensure(u.source, u.storeId).g.units.push(u);

  const movesByKey = new Map<string, TaggedMovement[]>();
  for (const m of opts.movements) {
    const asOf = opts.asOfByStore[m.store_id];
    if (!asOf || !withinDays(m.movement_date, asOf, 30)) continue;
    const { k } = ensure(m.source, m.store_id);
    const list = movesByKey.get(k) ?? [];
    list.push(m);
    movesByKey.set(k, list);
  }

  const soldByKey = new Map<string, number>();
  for (const d of opts.sold) {
    const asOf = opts.asOfByStore[d.store_id];
    if (!asOf || !withinDays(d.sale_date, asOf, opts.soldWindowDays)) continue;
    const k = groupKey(d.acquisition_source, opts.splitByStore ? d.store_id : null);
    if (!groups.has(k)) continue;
    soldByKey.set(k, (soldByKey.get(k) ?? 0) + 1);
  }

  const rows: SourceHealthRow[] = [];
  for (const [k, g] of groups) {
    rows.push(
      healthRow(k, g.label, g.storeId, g.units, totalUnits, movesByKey.get(k) ?? [], {
        sold: soldByKey.get(k) ?? 0,
        windowDays: opts.soldWindowDays,
        storeName: g.storeId ? opts.storeNames[g.storeId] ?? null : null,
      })
    );
  }

  rows.sort((a, b) => {
    if (a.key.startsWith(NO_SOURCE_KEY) !== b.key.startsWith(NO_SOURCE_KEY)) {
      return a.key.startsWith(NO_SOURCE_KEY) ? 1 : -1;
    }
    return b.units - a.units || a.label.localeCompare(b.label);
  });

  const allMoves = [...movesByKey.values()].flat();
  const totalSold = [...soldByKey.values()].reduce((s, n) => s + n, 0);
  const total = healthRow("__total", "Total", null, units, totalUnits, allMoves, {
    sold: totalSold,
    windowDays: opts.soldWindowDays,
    storeName: null,
  });

  return { rows, total };
}

function healthRow(
  key: string,
  label: string,
  storeId: string | null,
  units: TaggedUnit[],
  totalUnits: number,
  moves: TaggedMovement[],
  extra: { sold: number; windowDays: number; storeName: string | null }
): SourceHealthRow {
  const n = units.length;
  const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>;
  let totalCost = 0;
  let hot = 0;
  let noPrice = 0;
  let photoGaps = 0;
  let stale = 0;
  let retail = 0;
  let subprime = 0;
  let wholesale = 0;
  let over60 = 0;
  let srpSum = 0;
  let vdpSum = 0;
  let markupSum = 0;
  let markupCostSum = 0;

  for (const u of units) {
    totalCost += u.cost ?? 0;
    buckets[ageBucket(u.age)] += 1;
    if ((u.age ?? 0) > 60) over60 += 1;
    if (isHotUnit(u.age, u.snapshotDate)) hot += 1;
    if ((u.ph ?? 0) < FULL_PHOTO_COUNT) photoGaps += 1;
    if (u.disp === "subprime") subprime += 1;
    else if (u.disp === "wholesale") wholesale += 1;
    else {
      retail += 1;
      if (u.price == null) noPrice += 1;
      if ((u.dsr ?? 0) >= STALE_DAYS) stale += 1;
    }
    srpSum += u.srp ?? 0;
    vdpSum += u.vdp ?? 0;
    const mk = unitMarkup(u);
    if (mk != null && u.cost != null && u.cost > 0) {
      markupSum += mk;
      markupCostSum += u.cost;
    }
  }

  const exits = moves.filter((m) => m.type === "exit");
  const soldPerDay = extra.windowDays > 0 ? extra.sold / extra.windowDays : 0;

  return {
    key,
    label,
    storeId,
    storeName: extra.storeName,
    units: n,
    pctOfStock: totalUnits > 0 ? (n / totalUnits) * 100 : null,
    totalCost,
    avgCost: avg(units.map((u) => u.cost)),
    avgPrice: avg(units.map((u) => u.price)),
    avgMarkup: avg(units.map(unitMarkup)),
    markupPct: markupCostSum > 0 ? (markupSum / markupCostSum) * 100 : null,
    avgPom: avg(units.map((u) => u.pom)),
    avgCtm: avg(units.map((u) => u.ctm_pct)),
    avgMmrSpread: avg(units.map((u) => spread(u.mmr, u.cost))),
    avgJdSpread: avg(units.map((u) => spread(u.jd, u.cost))),
    avgBbSpread: avg(units.map((u) => spread(u.bb_retail, u.cost))),
    avgOdometer: avg(units.map((u) => u.odometer)),
    avgAge: avg(units.map((u) => u.age)),
    buckets,
    pctOver60: n > 0 ? (over60 / n) * 100 : null,
    hot,
    noPrice,
    photoGaps,
    stale,
    avgSpd: avg(units.map(srpPerDay)),
    vdpConv: srpSum > 0 ? (vdpSum / srpSum) * 100 : null,
    retail,
    subprime,
    wholesale,
    arrivals30: moves.filter((m) => m.type === "arrive").length,
    exits30: exits.length,
    avgExitAge: avg(exits.map((m) => m.age)),
    sold: extra.sold,
    daysSupply: soldPerDay > 0 ? n / soldPerDay : null,
    soldToStock: n > 0 ? extra.sold / n : null,
  };
}

export function spread(book: number | null, cost: number | null): number | null {
  if (book == null || cost == null) return null;
  return book - cost;
}

export function unitMarkup(u: Pick<InvUnitDetailRow, "markup" | "price" | "cost">): number | null {
  if (u.markup != null) return u.markup;
  if (u.price == null || u.cost == null) return null;
  return u.price - u.cost;
}

export function srpPerDay(u: Pick<InvUnitDetailRow, "srp" | "age">): number | null {
  if (u.srp == null) return null;
  return Math.max(u.srp, 0) / Math.max(u.age ?? 1, 1);
}

export function buildSoldResults(
  deals: SoldDeal[],
  opts: {
    windowDays: number;
    asOfByStore: Record<string, string>;
    splitByStore: boolean;
    storeNames: Record<string, string>;
  }
): { rows: SoldResultRow[]; total: SoldResultRow } {
  const inWindow = deals.filter((d) => {
    const asOf = opts.asOfByStore[d.store_id];
    return asOf != null && withinDays(d.sale_date, asOf, opts.windowDays);
  });

  const groups = new Map<string, { label: string; storeId: string | null; deals: SoldDeal[] }>();
  for (const d of inWindow) {
    const storeId = opts.splitByStore ? d.store_id : null;
    const k = groupKey(d.acquisition_source, storeId);
    let g = groups.get(k);
    if (!g) {
      g = { label: d.acquisition_source?.trim() || "Unassigned", storeId, deals: [] };
      groups.set(k, g);
    }
    g.deals.push(d);
  }

  const toRow = (
    key: string,
    label: string,
    storeId: string | null,
    list: SoldDeal[]
  ): SoldResultRow => {
    const totals = list.map((d) =>
      d.front_profit == null && d.back_profit == null
        ? null
        : (d.front_profit ?? 0) + (d.back_profit ?? 0)
    );
    return {
      key,
      label,
      storeId,
      storeName: storeId ? opts.storeNames[storeId] ?? null : null,
      sold: list.length,
      avgFront: avg(list.map((d) => d.front_profit)),
      avgBack: avg(list.map((d) => d.back_profit)),
      avgTotal: avg(totals),
      avgSalePrice: avg(list.map((d) => d.sale_price)),
      avgAgeAtSale: avg(list.map((d) => d.age)),
      totalGross: totals.reduce<number>((s, n) => s + (n ?? 0), 0),
    };
  };

  const rows = [...groups.entries()]
    .map(([k, g]) => toRow(k, g.label, g.storeId, g.deals))
    .sort((a, b) => {
      if (a.key.startsWith(NO_SOURCE_KEY) !== b.key.startsWith(NO_SOURCE_KEY)) {
        return a.key.startsWith(NO_SOURCE_KEY) ? 1 : -1;
      }
      return b.sold - a.sold || a.label.localeCompare(b.label);
    });

  return { rows, total: toRow("__total", "Total", null, inWindow) };
}

/** Matches a health/sold row key back to a unit's source (ignores the store suffix). */
export function unitMatchesSourceKey(u: Pick<TaggedUnit, "source">, key: string): boolean {
  return sourceKey(u.source) === key.split("::")[0];
}
