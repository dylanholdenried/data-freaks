import { FULL_PHOTO_COUNT, STALE_DAYS } from "./config";
import type { InvDailyMetrics, InvDisposition, InvMovement, InvPriceAction, InvUnitRow } from "./types";

/** Days from snapshotDate to the 1st of next month (inclusive of next month start). */
export function daysUntilFirstOfNextMonth(snapshotDate: string | Date): number {
  const d = typeof snapshotDate === "string" ? parseDateOnly(snapshotDate) : snapshotDate;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const nextFirst = new Date(Date.UTC(y, m + 1, 1));
  const start = Date.UTC(y, m, d.getUTCDate());
  return Math.round((nextFirst.getTime() - start) / 86_400_000);
}

/** Hot if age >= (90 - daysUntil1stOfNextMonth). */
export function hotAgeThreshold(snapshotDate: string | Date): number {
  return 90 - daysUntilFirstOfNextMonth(snapshotDate);
}

export function isHotUnit(age: number | null | undefined, snapshotDate: string | Date): boolean {
  if (age == null || !Number.isFinite(age)) return false;
  return age >= hotAgeThreshold(snapshotDate);
}

export function normalizeDisp(raw: unknown): InvDisposition {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "subprime") return "subprime";
  return "retail";
}

export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** Excel date serial → Date (UTC midnight). */
export function excelSerialToDate(serial: number): Date {
  // Excel epoch 1899-12-30 (accounting for Lotus leap bug)
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(utc);
}

export function daysSinceChange(
  lastChange: Date | null,
  snapshotDate: string | Date
): number | null {
  if (!lastChange) return null;
  const snap =
    typeof snapshotDate === "string" ? parseDateOnly(snapshotDate) : snapshotDate;
  const diff = Math.round(
    (Date.UTC(snap.getUTCFullYear(), snap.getUTCMonth(), snap.getUTCDate()) -
      Date.UTC(
        lastChange.getUTCFullYear(),
        lastChange.getUTCMonth(),
        lastChange.getUTCDate()
      )) /
      86_400_000
  );
  // vAuto sometimes stamps tomorrow → treat <=0 as changed today
  return diff <= 0 ? 0 : diff;
}

export function computeVr(vdp: number | null, srp: number | null): number | null {
  if (srp == null || srp === 0 || vdp == null) return null;
  return Math.round((vdp / srp) * 10000) / 100;
}

export function pomToPercent(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  // Export stores 0.943; if already > 2 assume already percent
  if (raw > 2) return Math.round(raw * 10) / 10;
  return Math.round(raw * 1000) / 10;
}

export type PrevUnitLite = {
  stk: string;
  price: number | null;
  srp: number | null;
  vdp: number | null;
  ph: number | null;
  veh: string | null;
  age: number | null;
  cost: number | null;
};

export function attachDeltas(
  units: Omit<InvUnitRow, "d_vdp" | "d_srp" | "d_p" | "d_ph">[],
  prevByStk: Map<string, PrevUnitLite>
): InvUnitRow[] {
  return units.map((u) => {
    const prev = prevByStk.get(u.stk);
    if (!prev) {
      return { ...u, d_vdp: null, d_srp: null, d_p: null, d_ph: null };
    }
    return {
      ...u,
      d_vdp: numDelta(u.vdp, prev.vdp),
      d_srp: numDelta(u.srp, prev.srp),
      d_p: numDelta(u.price, prev.price),
      d_ph: numDelta(u.ph, prev.ph),
    };
  });
}

function numDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  return curr - prev;
}

export function computeDailyMetrics(
  storeId: string,
  snapshotDate: string,
  units: InvUnitRow[]
): InvDailyMetrics {
  const n = units.length;
  const ages = units.map((u) => u.age).filter((a): a is number => a != null);
  const avgAge =
    ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;

  let over60 = 0;
  let over90 = 0;
  let full = 0;
  let noPh = 0;
  let stale = 0;
  let noPrice = 0;
  let hot = 0;
  let hotCost = 0;
  let retail = 0;
  let subprime = 0;

  for (const u of units) {
    if ((u.age ?? 0) >= 60) over60 += 1;
    if ((u.age ?? 0) >= 90) over90 += 1;
    if ((u.ph ?? 0) >= FULL_PHOTO_COUNT) full += 1;
    if ((u.ph ?? 0) === 0) noPh += 1;
    if (u.disp === "retail") {
      retail += 1;
      const dsr = u.dsr ?? 0;
      if (dsr >= STALE_DAYS) stale += 1;
      if (u.price == null) noPrice += 1;
    } else {
      subprime += 1;
    }
    if (isHotUnit(u.age, snapshotDate)) {
      hot += 1;
      hotCost += u.cost ?? 0;
    }
  }

  return {
    store_id: storeId,
    snapshot_date: snapshotDate,
    units: n,
    avg_age: avgAge,
    over60,
    over90,
    full_photos: full,
    no_ph: noPh,
    stale,
    no_price: noPrice,
    hot,
    hot_cost: hotCost,
    ttl_fail: null,
    retail_count: retail,
    subprime_count: subprime,
  };
}

export function computeMovements(
  storeId: string,
  snapshotDate: string,
  current: InvUnitRow[],
  prev: PrevUnitLite[]
): InvMovement[] {
  const currStk = new Set(current.map((u) => u.stk));
  const prevStk = new Set(prev.map((u) => u.stk));
  const out: InvMovement[] = [];

  for (const p of prev) {
    if (!currStk.has(p.stk)) {
      out.push({
        store_id: storeId,
        movement_date: snapshotDate,
        type: "exit",
        stk: p.stk,
        veh: p.veh,
        age: p.age,
        cost: p.cost,
      });
    }
  }
  for (const u of current) {
    if (!prevStk.has(u.stk)) {
      out.push({
        store_id: storeId,
        movement_date: snapshotDate,
        type: "arrive",
        stk: u.stk,
        veh: u.veh,
        age: u.age,
        cost: u.cost,
      });
    }
  }
  return out;
}

export function computePriceActions(
  storeId: string,
  snapshotDate: string,
  current: InvUnitRow[],
  prevByStk: Map<string, PrevUnitLite>
): InvPriceAction[] {
  const out: InvPriceAction[] = [];
  for (const u of current) {
    const prev = prevByStk.get(u.stk);
    if (!prev) continue;
    // First-time pricing is NOT a price action
    if (prev.price == null || u.price == null) continue;
    if (prev.price === u.price) continue;
    const dP = u.price - prev.price;
    out.push({
      store_id: storeId,
      action_date: snapshotDate,
      stk: u.stk,
      veh: u.veh,
      age: u.age,
      type: dP < 0 ? "cut" : "raise",
      price: u.price,
      d_p: dP,
    });
  }
  return out;
}
