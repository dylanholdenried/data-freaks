/** DH Purchases — personal inventory by store stock prefix (DHL / DHC). */

import {
  ACQ_STAGE_LABELS,
  type AcqPurchaseStage,
} from "@/lib/acquire/types";
import { displayYmm } from "@/lib/acquire/incoming";
import { FULL_PHOTO_COUNT } from "./config";
import {
  calledAction,
  formatVehYmm,
  mmrWater,
  storeShortLabel,
  type CalledAction,
} from "./midmo";
import type { InvDisposition, InvUnitRow } from "./types";

/** Slim Acquire overlay joined onto DH rows by stock #. */
export type DhPurchaseOverlay = {
  stock_number: string | null;
  stage: AcqPurchaseStage;
  on_hold: boolean;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

export type DhUnitRow = InvUnitRow & {
  storeId: string;
  storeName: string;
  storeLabel: string;
  mmrSpread: number | null;
  jdSpread: number | null;
  spd: number | null;
  action: CalledAction;
  /** Year / make / model only (trim stripped). */
  vehDisplay: string;
  /** Acquire pipeline status label, or null if unmatched. */
  statusLabel: string | null;
  /** Upload disposition bucket: Prime / Subprime / Wholesale. */
  strategyLabel: string;
  markup: number | null;
};

function normStock(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/** Map inventory upload `disp` to the strategy labels used on the DH tab. */
export function dhStrategyLabel(disp: InvDisposition | string | null | undefined): string {
  const s = String(disp ?? "")
    .trim()
    .toLowerCase();
  if (s === "subprime") return "Subprime";
  if (s === "wholesale") return "Wholesale";
  return "Prime";
}

export function buildDhPurchaseMap(
  purchases: DhPurchaseOverlay[]
): Map<string, DhPurchaseOverlay> {
  const map = new Map<string, DhPurchaseOverlay>();
  for (const p of purchases) {
    const key = normStock(p.stock_number);
    if (key) map.set(key, p);
  }
  return map;
}

function statusFromPurchase(p: DhPurchaseOverlay | undefined): string | null {
  if (!p) return null;
  const base = ACQ_STAGE_LABELS[p.stage] ?? p.stage;
  return p.on_hold ? `On Hold · ${base}` : base;
}

function vehFromPurchase(p: DhPurchaseOverlay | undefined, fallbackVeh: string | null): string {
  if (
    p &&
    (p.vehicle_year != null || p.vehicle_make || p.vehicle_model)
  ) {
    return displayYmm(p);
  }
  return formatVehYmm(fallbackVeh);
}

/** Linn → DHL, Centralia → DHC. */
export function dhPrefixForStore(storeName: string): string | null {
  const n = storeName.toLowerCase();
  if (n.includes("linn")) return "DHL";
  if (n.includes("centralia")) return "DHC";
  return null;
}

/**
 * True for DH purchases only — prefix DHL/DHC and a numeric suffix.
 * Stocks ending in a letter (e.g. DHL1000A) are trades, not DH purchases.
 */
export function isDhStockForStore(
  stk: string | null | undefined,
  storeName: string
): boolean {
  const prefix = dhPrefixForStore(storeName);
  if (!prefix) return false;
  const key = (stk ?? "").trim().toUpperCase();
  if (!key.startsWith(prefix)) return false;
  return !/[A-Z]$/.test(key);
}

export function dhUnitsForStore(units: InvUnitRow[], storeName: string): InvUnitRow[] {
  return units.filter((u) => isDhStockForStore(u.stk, storeName));
}

function avgOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

export function enrichDhUnit(
  u: InvUnitRow,
  storeId: string,
  storeName: string,
  purchase?: DhPurchaseOverlay
): DhUnitRow {
  const age = u.age ?? 0;
  const spd =
    age >= 1
      ? +(Math.max(u.srp ?? 0, 0) / Math.max(age, 1)).toFixed(1)
      : u.srp != null
        ? +(u.srp).toFixed(1)
        : null;
  return {
    ...u,
    storeId,
    storeName,
    storeLabel: storeShortLabel(storeName),
    mmrSpread: mmrWater(u),
    jdSpread: u.jd != null && u.cost != null ? u.jd - u.cost : null,
    spd,
    action: calledAction(u),
    vehDisplay: vehFromPurchase(purchase, u.veh),
    statusLabel: statusFromPurchase(purchase),
    strategyLabel: dhStrategyLabel(u.disp),
    markup: u.price != null && u.cost != null ? u.price - u.cost : null,
  };
}

export function collectDhUnitsForStore(
  units: InvUnitRow[],
  storeId: string,
  storeName: string,
  purchases: DhPurchaseOverlay[] = []
): DhUnitRow[] {
  const byStock = buildDhPurchaseMap(purchases);
  return dhUnitsForStore(units, storeName)
    .map((u) => enrichDhUnit(u, storeId, storeName, byStock.get(normStock(u.stk))))
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
}

export function dhNeedsPrice(rows: DhUnitRow[]): DhUnitRow[] {
  return rows.filter((u) => u.price == null).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
}

export function dhNeedsPhotos(rows: DhUnitRow[]): DhUnitRow[] {
  return rows
    .filter((u) => (u.ph ?? 0) < FULL_PHOTO_COUNT)
    .sort((a, b) => (a.ph ?? 0) - (b.ph ?? 0) || (b.age ?? 0) - (a.age ?? 0));
}

/** Unpriced and/or incomplete photos — merchandising blockers. */
export function dhMerchGaps(rows: DhUnitRow[]): DhUnitRow[] {
  const seen = new Set<string>();
  const out: DhUnitRow[] = [];
  for (const u of [...dhNeedsPrice(rows), ...dhNeedsPhotos(rows)]) {
    const key = `${u.storeId}:${u.stk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out.sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
}

/** Getting looks but not converting — price/photos likely wrong. */
export function dhHighLookersNotSelling(rows: DhUnitRow[]): DhUnitRow[] {
  return rows
    .filter((u) => {
      if ((u.age ?? 0) < 7) return false;
      if ((u.srp ?? 0) >= 300 && (u.vr ?? 99) < 1) return true;
      if ((u.vdp ?? 0) >= 20 && (u.vr ?? 99) < 1.5) return true;
      return false;
    })
    .sort((a, b) => (b.srp ?? 0) - (a.srp ?? 0));
}

/**
 * Aged DH cars with weak online visibility (low SRP/day).
 * Median SRP/day among aged DH is the cutoff when enough sample exists.
 */
export function dhLowVisibility(rows: DhUnitRow[]): DhUnitRow[] {
  const aged = rows.filter((u) => (u.age ?? 0) >= 7 && u.spd != null);
  if (aged.length === 0) return [];

  const spds = aged.map((u) => u.spd!).sort((a, b) => a - b);
  const mid = spds[Math.floor(spds.length / 2)] ?? 0;
  const cutoff = aged.length >= 4 ? mid : Math.max(10, mid);

  return aged
    .filter((u) => (u.spd ?? 0) <= cutoff)
    .sort((a, b) => (a.spd ?? 0) - (b.spd ?? 0) || (b.age ?? 0) - (a.age ?? 0));
}

export function dhSummary(rows: DhUnitRow[]) {
  const ages = rows.map((u) => u.age).filter((a): a is number => a != null);
  const mmrSpreads = rows
    .map((u) => u.mmrSpread)
    .filter((n): n is number => n != null);
  const jdSpreads = rows
    .map((u) => u.jdSpread)
    .filter((n): n is number => n != null);
  return {
    count: rows.length,
    noPrice: rows.filter((u) => u.price == null).length,
    photoGaps: rows.filter((u) => (u.ph ?? 0) < FULL_PHOTO_COUNT).length,
    avgAge: avgOf(ages),
    costTied: rows.reduce((s, u) => s + (u.cost || 0), 0),
    avgMmrSpread: avgOf(mmrSpreads),
    avgJdSpread: avgOf(jdSpreads),
  };
}
