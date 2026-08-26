/** DH Purchases — personal inventory by store stock prefix (DHL / DHC). */

import { FULL_PHOTO_COUNT } from "./config";
import {
  calledAction,
  mmrWater,
  storeShortLabel,
  type CalledAction,
} from "./midmo";
import type { InvUnitRow } from "./types";

export type DhUnitRow = InvUnitRow & {
  storeId: string;
  storeName: string;
  storeLabel: string;
  mmrSpread: number | null;
  jdSpread: number | null;
  spd: number | null;
  action: CalledAction;
};

/** Linn → DHL, Centralia → DHC. */
export function dhPrefixForStore(storeName: string): string | null {
  const n = storeName.toLowerCase();
  if (n.includes("linn")) return "DHL";
  if (n.includes("centralia")) return "DHC";
  return null;
}

export function isDhStockForStore(
  stk: string | null | undefined,
  storeName: string
): boolean {
  const prefix = dhPrefixForStore(storeName);
  if (!prefix) return false;
  return (stk ?? "").trim().toUpperCase().startsWith(prefix);
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
  storeName: string
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
  };
}

export function collectDhUnitsForStore(
  units: InvUnitRow[],
  storeId: string,
  storeName: string
): DhUnitRow[] {
  return dhUnitsForStore(units, storeName)
    .map((u) => enrichDhUnit(u, storeId, storeName))
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
