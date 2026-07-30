import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachDeltas,
  computeDailyMetrics,
  computeMovements,
  computePriceActions,
  type PrevUnitLite,
} from "./compute";
import { parseVautoExport } from "./parse";
import type { InvUnitRow } from "./types";

export type IngestResult = {
  snapshotId: string;
  storeId: string;
  snapshotDate: string;
  unitCount: number;
  arrivals: number;
  exits: number;
  priceActions: number;
  replaced: boolean;
};

type UnitDbRow = {
  stk: string;
  veh: string | null;
  age: number | null;
  cost: number | null;
  price: number | null;
  srp: number | null;
  vdp: number | null;
  ph: number | null;
};

export async function ingestInventoryExport(opts: {
  supabase: SupabaseClient;
  storeId: string;
  snapshotDate: string;
  fileBuffer: Buffer;
  filename: string;
  uploadedBy?: string | null;
}): Promise<IngestResult> {
  const { supabase, storeId, snapshotDate, fileBuffer, filename, uploadedBy } = opts;

  const parsed = parseVautoExport(fileBuffer, snapshotDate, filename);

  // Previous snapshot (before replace)
  const { data: prevSnap } = await supabase
    .from("inv_snapshots")
    .select("id, snapshot_date")
    .eq("store_id", storeId)
    .lt("snapshot_date", snapshotDate)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Also check same-day snapshot for replace
  const { data: sameDay } = await supabase
    .from("inv_snapshots")
    .select("id")
    .eq("store_id", storeId)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();

  let prevUnits: UnitDbRow[] = [];
  if (prevSnap?.id) {
    const { data } = await supabase
      .from("inv_units")
      .select("stk,veh,age,cost,price,srp,vdp,ph")
      .eq("snapshot_id", prevSnap.id);
    prevUnits = (data ?? []) as UnitDbRow[];
  }

  const prevLite: PrevUnitLite[] = prevUnits.map((u) => ({
    stk: u.stk,
    price: u.price,
    srp: u.srp,
    vdp: u.vdp,
    ph: u.ph,
    veh: u.veh,
    age: u.age,
    cost: u.cost,
  }));
  const prevByStk = new Map(prevLite.map((u) => [u.stk, u]));

  const units: InvUnitRow[] = attachDeltas(parsed, prevByStk);
  const metrics = computeDailyMetrics(storeId, snapshotDate, units);
  const movements = computeMovements(storeId, snapshotDate, units, prevLite);
  const priceActions = computePriceActions(storeId, snapshotDate, units, prevByStk);

  const replaced = Boolean(sameDay?.id);
  if (sameDay?.id) {
    await supabase.from("inv_snapshots").delete().eq("id", sameDay.id);
  }

  // Clear same-day derived rows (movements / price_actions / metrics)
  await supabase
    .from("inv_daily_metrics")
    .delete()
    .eq("store_id", storeId)
    .eq("snapshot_date", snapshotDate);
  await supabase
    .from("inv_movements")
    .delete()
    .eq("store_id", storeId)
    .eq("movement_date", snapshotDate);
  await supabase
    .from("inv_price_actions")
    .delete()
    .eq("store_id", storeId)
    .eq("action_date", snapshotDate);

  const { data: snap, error: snapErr } = await supabase
    .from("inv_snapshots")
    .insert({
      store_id: storeId,
      snapshot_date: snapshotDate,
      source_filename: filename,
      row_count: units.length,
      uploaded_by: uploadedBy ?? null,
    })
    .select("id")
    .single();

  if (snapErr || !snap) {
    throw new Error(`Snapshot insert failed: ${snapErr?.message ?? "unknown"}`);
  }

  const unitRows = units.map((u) => ({
    snapshot_id: snap.id,
    stk: u.stk,
    veh: u.veh,
    body: u.body,
    age: u.age,
    ph: u.ph,
    cost: u.cost,
    price: u.price,
    pom: u.pom,
    dsr: u.dsr,
    srp: u.srp,
    vdp: u.vdp,
    vr: u.vr,
    mmr: u.mmr,
    jd: u.jd,
    pt: u.pt,
    disp: u.disp,
    d_vdp: u.d_vdp,
    d_srp: u.d_srp,
    d_p: u.d_p,
    d_ph: u.d_ph,
  }));

  // Batch insert units
  const chunk = 200;
  for (let i = 0; i < unitRows.length; i += chunk) {
    const { error } = await supabase.from("inv_units").insert(unitRows.slice(i, i + chunk));
    if (error) throw new Error(`Unit insert failed: ${error.message}`);
  }

  const { error: metErr } = await supabase.from("inv_daily_metrics").insert({
    store_id: metrics.store_id,
    snapshot_date: metrics.snapshot_date,
    units: metrics.units,
    avg_age: metrics.avg_age,
    over60: metrics.over60,
    over90: metrics.over90,
    full_photos: metrics.full_photos,
    no_ph: metrics.no_ph,
    stale: metrics.stale,
    no_price: metrics.no_price,
    hot: metrics.hot,
    hot_cost: metrics.hot_cost,
    ttl_fail: metrics.ttl_fail,
    retail_count: metrics.retail_count,
    subprime_count: metrics.subprime_count,
  });
  if (metErr) throw new Error(`Metrics insert failed: ${metErr.message}`);

  if (movements.length > 0) {
    const { error } = await supabase.from("inv_movements").insert(movements);
    if (error) throw new Error(`Movements insert failed: ${error.message}`);
  }
  if (priceActions.length > 0) {
    const { error } = await supabase.from("inv_price_actions").insert(priceActions);
    if (error) throw new Error(`Price actions insert failed: ${error.message}`);
  }

  return {
    snapshotId: snap.id,
    storeId,
    snapshotDate,
    unitCount: units.length,
    arrivals: movements.filter((m) => m.type === "arrive").length,
    exits: movements.filter((m) => m.type === "exit").length,
    priceActions: priceActions.length,
    replaced,
  };
}
