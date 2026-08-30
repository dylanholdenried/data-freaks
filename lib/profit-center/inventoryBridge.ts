/**
 * Match latest inventory units to Profit Center model cohorts.
 */

import { FULL_PHOTO_COUNT, INV_TARGETS } from "@/lib/inventory-command/config";
import { parseVehMakeModel } from "@/lib/inventory-command/midmo";
import { priceBandForSalePrice } from "./priceBands";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export type InventoryBridgeSummary = {
  count: number;
  avgAge: number | null;
  over60: number;
  totalCost: number;
  snapshotDate: string | null;
};

export type UnitRating = "good" | "bad" | "neutral";

export type RatedInventoryUnit = {
  unit: InvUnitRow;
  rating: UnitRating;
  reasons: string[];
};

export type SalesProfile = {
  bestPriceBandKey: string | null;
  worstPriceBandKey: string | null;
  bestYearLabel: string | null;
  worstYearLabel: string | null;
};

export function emptyInventoryBridge(
  snapshotDate: string | null = null
): InventoryBridgeSummary {
  return {
    count: 0,
    avgAge: null,
    over60: 0,
    totalCost: 0,
    snapshotDate,
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function parseVehYear(veh: string | null | undefined): number | null {
  if (!veh?.trim()) return null;
  const first = veh.trim().split(/\s+/)[0];
  if (first && /^\d{4}$/.test(first)) return Number(first);
  return null;
}

/** Units on lot matching make + model. */
export function filterModelInventoryUnits(
  units: InvUnitRow[],
  make: string,
  model: string
): InvUnitRow[] {
  const wantMake = norm(make);
  const wantModel = norm(model);
  const matched: InvUnitRow[] = [];

  for (const u of units) {
    const parsed = parseVehMakeModel(u.veh);
    if (norm(parsed.make) !== wantMake) continue;
    if (
      wantModel &&
      !norm(parsed.model).startsWith(wantModel) &&
      norm(parsed.model) !== wantModel
    ) {
      if (
        !norm(parsed.model).includes(wantModel) &&
        !wantModel.includes(norm(parsed.model))
      ) {
        continue;
      }
    }
    matched.push(u);
  }

  return matched;
}

/** Summarize on-lot units matching make + model. */
export function summarizeModelInventory(
  units: InvUnitRow[],
  make: string,
  model: string,
  snapshotDate: string | null = null
): InventoryBridgeSummary {
  const matched = filterModelInventoryUnits(units, make, model);

  if (matched.length === 0) {
    return emptyInventoryBridge(snapshotDate);
  }

  const ages = matched
    .map((u) => u.age)
    .filter((a): a is number => a != null && Number.isFinite(a));
  const avgAge =
    ages.length === 0
      ? null
      : ages.reduce((s, a) => s + a, 0) / ages.length;
  const over60 = matched.filter((u) => (u.age ?? 0) >= 60).length;
  const totalCost = matched.reduce((s, u) => s + (u.cost || 0), 0);

  return {
    count: matched.length,
    avgAge,
    over60,
    totalCost,
    snapshotDate,
  };
}

function lotHealthScore(u: InvUnitRow): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const age = u.age ?? 0;

  if (age >= 60) {
    score -= 2;
    reasons.push(`${age}d on lot — aged`);
  } else if (age > INV_TARGETS.turnDays) {
    score -= 1;
    reasons.push(`${age}d on lot — past turn target`);
  } else if (age <= INV_TARGETS.turnDays) {
    score += 1;
    reasons.push(`${age}d on lot — healthy turn`);
  }

  if (u.price == null || u.price <= 0) {
    score -= 1;
    reasons.push("missing retail price");
  }

  if (u.ph != null && u.ph === 0) {
    score -= 1;
    reasons.push("no photos");
  } else if (u.ph != null && u.ph < FULL_PHOTO_COUNT) {
    score -= 0.5;
    reasons.push(`${u.ph} photos — under full set`);
  } else if (u.ph != null && u.ph >= FULL_PHOTO_COUNT) {
    score += 0.5;
    reasons.push("fully merchandised");
  }

  return { score, reasons };
}

function salesMatchScore(
  u: InvUnitRow,
  profile: SalesProfile
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const band = priceBandForSalePrice(u.price);
  if (band && profile.bestPriceBandKey && band.id === profile.bestPriceBandKey) {
    score += 2;
    reasons.push(`price band ${band.label} — strong seller for this model`);
  }
  if (band && profile.worstPriceBandKey && band.id === profile.worstPriceBandKey) {
    score -= 2;
    reasons.push(`price band ${band.label} — weak seller for this model`);
  }

  const year = parseVehYear(u.veh);
  if (year != null && profile.bestYearLabel === String(year)) {
    score += 1;
    reasons.push(`${year} — top year for this model`);
  }
  if (year != null && profile.worstYearLabel === String(year)) {
    score -= 1;
    reasons.push(`${year} — weak year for this model`);
  }

  return { score, reasons };
}

/** Rate each on-lot unit using lot health + historical sale profile. */
export function rateInventoryUnits(
  units: InvUnitRow[],
  profile: SalesProfile
): RatedInventoryUnit[] {
  return units.map((unit) => {
    const lot = lotHealthScore(unit);
    const sales = salesMatchScore(unit, profile);
    const total = lot.score + sales.score;
    const reasons = [...lot.reasons, ...sales.reasons];

    let rating: UnitRating = "neutral";
    if (total >= 1.5) rating = "good";
    else if (total <= -1.5) rating = "bad";
    else if (lot.score < 0 && sales.score <= 0) rating = "bad";
    else if (lot.score >= 0 && sales.score > 0) rating = "good";

    return { unit, rating, reasons };
  });
}

export function onLotInventoryHref(opts: {
  make: string;
  model: string;
  preset?: string;
  storeId?: string;
  departmentName?: string;
}): string {
  const q = new URLSearchParams();
  q.set("make", opts.make);
  q.set("model", opts.model);
  if (opts.preset) q.set("preset", opts.preset);
  if (opts.storeId && opts.storeId !== "all") q.set("store", opts.storeId);
  if (opts.departmentName && opts.departmentName !== "all") {
    q.set("department", opts.departmentName);
  }
  return `/app/profit-center/on-lot?${q.toString()}`;
}

export function inventoryBridgeCue(
  summary: InventoryBridgeSummary,
  buySignal: boolean
): string | null {
  if (summary.count === 0) {
    return buySignal
      ? "No matching units on the latest lot snapshot — acquisition room if demand holds."
      : null;
  }
  const ageBit =
    summary.avgAge != null ? ` · avg age ${Math.round(summary.avgAge)}d` : "";
  const agedBit =
    summary.over60 > 0 ? ` · ${summary.over60} over 60d` : "";

  if (
    buySignal &&
    (summary.count >= 5 ||
      (summary.avgAge != null && summary.avgAge >= INV_TARGETS.turnDays))
  ) {
    return `Buy signal, but ${summary.count} on lot${ageBit}${agedBit} — turn existing stock before buying more.`;
  }
  if (buySignal) {
    return `${summary.count} on lot${ageBit}${agedBit} — buy more still makes sense if turn stays healthy.`;
  }
  return `${summary.count} on lot${ageBit}${agedBit} — avoid adding until the retail path improves.`;
}
