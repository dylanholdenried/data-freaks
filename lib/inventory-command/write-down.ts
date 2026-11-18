import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDateOnly } from "./compute";
import type {
  InvUnitDetailRow,
  WriteDownBbManual,
  WriteDownCohortRow,
} from "./types";

export const WRITE_DOWN_YEAR = 2026;

export function isJimButlerStore(name: string | null | undefined): boolean {
  return /^jim\s+butler\b/i.test(String(name ?? "").trim());
}

/** Days from snapshot to Dec 31 of the write-down year (can be negative after year-end). */
export function daysUntilWriteDownTarget(
  snapshotDate: string,
  year = WRITE_DOWN_YEAR
): number {
  const snap = parseDateOnly(snapshotDate);
  const end = Date.UTC(year, 11, 31);
  const start = Date.UTC(snap.getUTCFullYear(), snap.getUTCMonth(), snap.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

/** Projected age on Dec 31 of the write-down year from a known age-as-of date. */
export function ageOnWriteDownTarget(
  age: number | null | undefined,
  asOfDate: string,
  year = WRITE_DOWN_YEAR
): number | null {
  if (age == null || !Number.isFinite(age)) return null;
  const days = daysUntilWriteDownTarget(asOfDate, year);
  return Math.max(0, age + Math.max(0, days));
}

/** True if the unit will be (or already is) 60+ days old on Dec 31 of the write-down year. */
export function isWriteDownEligible(
  age: number | null | undefined,
  snapshotDate: string,
  year = WRITE_DOWN_YEAR
): boolean {
  const projected = ageOnWriteDownTarget(age, snapshotDate, year);
  return projected != null && projected >= 60;
}

export function writeDownAmount(
  cost: number | null | undefined,
  bbAvgWholesale: number | null | undefined
): number | null {
  if (cost == null || bbAvgWholesale == null) return null;
  const raw = cost - bbAvgWholesale;
  return raw > 0 ? raw : 0;
}

export function effectiveBbAvgWholesale(
  uploaded: number | null | undefined,
  manual: number | null | undefined
): number | null {
  if (manual != null && Number.isFinite(manual)) return manual;
  if (uploaded != null && Number.isFinite(uploaded)) return uploaded;
  return null;
}

export type WriteDownDisplayRow = {
  stk: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  age: number | null;
  /** Projected age on Dec 31 of the write-down year. */
  age_on_1231: number | null;
  cost: number | null;
  bb_avg_wholesale: number | null;
  bb_uploaded: number | null;
  write_down: number | null;
  missing_bb: boolean;
  manual: boolean;
  manual_entered_on: string | null;
  sold_date: string | null;
};

function manualMap(rows: WriteDownBbManual[]): Map<string, WriteDownBbManual> {
  const m = new Map<string, WriteDownBbManual>();
  for (const r of rows) m.set(r.stk.trim().toUpperCase(), r);
  return m;
}

export function buildActiveWriteDownRows(
  units: InvUnitDetailRow[],
  snapshotDate: string,
  manuals: WriteDownBbManual[],
  year = WRITE_DOWN_YEAR
): WriteDownDisplayRow[] {
  const man = manualMap(manuals);
  return units
    .filter(
      (u) => u.disp !== "wholesale" && isWriteDownEligible(u.age, snapshotDate, year)
    )
    .map((u) => {
      const key = u.stk.trim().toUpperCase();
      const m = man.get(key);
      const uploaded = u.bb_avg_wholesale;
      const bb = effectiveBbAvgWholesale(uploaded, m?.bb_avg_wholesale);
      return {
        stk: u.stk,
        vin: u.vin,
        year: u.year,
        make: u.make,
        model: u.model,
        age: u.age,
        age_on_1231: ageOnWriteDownTarget(u.age, snapshotDate, year),
        cost: u.cost,
        bb_avg_wholesale: bb,
        bb_uploaded: uploaded,
        write_down: writeDownAmount(u.cost, bb),
        missing_bb: uploaded == null,
        manual: m != null,
        manual_entered_on: m?.entered_on ?? null,
        sold_date: null,
      };
    });
}

export function buildSoldWriteDownRows(
  sold: WriteDownCohortRow[],
  manuals: WriteDownBbManual[],
  year = WRITE_DOWN_YEAR
): WriteDownDisplayRow[] {
  const man = manualMap(manuals);
  return sold.map((u) => {
    const key = u.stk.trim().toUpperCase();
    const m = man.get(key);
    const uploaded = u.bb_avg_wholesale;
    const bb = effectiveBbAvgWholesale(uploaded, m?.bb_avg_wholesale);
    const asOf = u.last_seen_date || u.sold_date || `${year}-12-31`;
    return {
      stk: u.stk,
      vin: u.vin,
      year: u.veh_year,
      make: u.make,
      model: u.model,
      age: u.age,
      age_on_1231: ageOnWriteDownTarget(u.age, asOf, year),
      cost: u.cost,
      bb_avg_wholesale: bb,
      bb_uploaded: uploaded,
      write_down: writeDownAmount(u.cost, bb),
      missing_bb: uploaded == null,
      manual: m != null,
      manual_entered_on: m?.entered_on ?? null,
      sold_date: u.sold_date,
    };
  });
}

export function writeDownTotals(rows: WriteDownDisplayRow[]) {
  return {
    units: rows.length,
    cost: rows.reduce((s, r) => s + (r.cost ?? 0), 0),
    writeDown: rows.reduce((s, r) => s + (r.write_down ?? 0), 0),
  };
}

/** Upsert eligible units as in_stock; mark prior in_stock units missing from inventory as sold. */
export async function syncWriteDownCohort(
  supabase: SupabaseClient,
  opts: {
    storeId: string;
    snapshotDate: string;
    units: InvUnitDetailRow[];
    year?: number;
  }
): Promise<void> {
  const year = opts.year ?? WRITE_DOWN_YEAR;
  const { storeId, snapshotDate, units } = opts;
  const inInventory = new Set(units.map((u) => u.stk.trim().toUpperCase()));
  const eligible = units.filter(
    (u) => u.disp !== "wholesale" && isWriteDownEligible(u.age, snapshotDate, year)
  );

  if (eligible.length > 0) {
    const payload = eligible.map((u) => ({
      store_id: storeId,
      write_down_year: year,
      stk: u.stk,
      vin: u.vin,
      veh_year: u.year,
      make: u.make,
      model: u.model,
      age: u.age,
      cost: u.cost,
      bb_avg_wholesale: u.bb_avg_wholesale,
      first_seen_date: snapshotDate,
      last_seen_date: snapshotDate,
      status: "in_stock" as const,
      sold_date: null,
      updated_at: new Date().toISOString(),
    }));

    // Preserve first_seen_date on conflict via a two-step: fetch existing, then upsert.
    const { data: existing } = await supabase
      .from("inv_write_down_cohort")
      .select("stk, first_seen_date")
      .eq("store_id", storeId)
      .eq("write_down_year", year)
      .in(
        "stk",
        payload.map((p) => p.stk)
      );

    const firstSeen = new Map(
      (existing ?? []).map((r) => [String(r.stk).trim().toUpperCase(), r.first_seen_date as string])
    );

    const rows = payload.map((p) => ({
      ...p,
      first_seen_date: firstSeen.get(p.stk.trim().toUpperCase()) ?? p.first_seen_date,
    }));

    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await supabase.from("inv_write_down_cohort").upsert(rows.slice(i, i + chunk), {
        onConflict: "store_id,write_down_year,stk",
      });
      if (error) throw new Error(`Write-down cohort upsert failed: ${error.message}`);
    }
  }

  const { data: activeRows, error: activeErr } = await supabase
    .from("inv_write_down_cohort")
    .select("stk")
    .eq("store_id", storeId)
    .eq("write_down_year", year)
    .eq("status", "in_stock");
  if (activeErr) throw new Error(`Write-down cohort load failed: ${activeErr.message}`);

  const toSold = (activeRows ?? [])
    .map((r) => String(r.stk))
    .filter((stk) => !inInventory.has(stk.trim().toUpperCase()));

  if (toSold.length > 0) {
    const { error } = await supabase
      .from("inv_write_down_cohort")
      .update({
        status: "sold",
        sold_date: snapshotDate,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("write_down_year", year)
      .eq("status", "in_stock")
      .in("stk", toSold);
    if (error) throw new Error(`Write-down sold mark failed: ${error.message}`);
  }
}

export async function loadWriteDownManuals(
  supabase: SupabaseClient,
  storeId: string,
  year = WRITE_DOWN_YEAR
): Promise<WriteDownBbManual[]> {
  const { data, error } = await supabase
    .from("inv_write_down_bb_manual")
    .select("store_id, write_down_year, stk, bb_avg_wholesale, entered_on")
    .eq("store_id", storeId)
    .eq("write_down_year", year);
  if (error) throw new Error(error.message);
  return (data ?? []) as WriteDownBbManual[];
}

export async function loadSoldWriteDownCohort(
  supabase: SupabaseClient,
  storeId: string,
  year = WRITE_DOWN_YEAR
): Promise<WriteDownCohortRow[]> {
  const { data, error } = await supabase
    .from("inv_write_down_cohort")
    .select(
      "store_id, write_down_year, stk, vin, veh_year, make, model, age, cost, bb_avg_wholesale, first_seen_date, last_seen_date, status, sold_date"
    )
    .eq("store_id", storeId)
    .eq("write_down_year", year)
    .eq("status", "sold")
    .order("sold_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WriteDownCohortRow[];
}
