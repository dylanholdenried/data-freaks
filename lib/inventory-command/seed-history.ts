import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvDailyMetrics, InvMovement, InvPriceAction } from "./types";

/**
 * Expected JSON shape from the legacy Inventory Command dashboard embed.
 * Units are optional — if omitted, only series/events are seeded.
 */
export type HistorySeedPayload = {
  storeId: string;
  /** Daily series rows (calibrated metrics). */
  series?: Array<Partial<InvDailyMetrics> & { snapshot_date: string }>;
  movements?: InvMovement[];
  priceActions?: InvPriceAction[];
  /** Optional per-day unit dumps: { "2025-07-01": [ {stk,...}, ... ] } */
  unitsByDate?: Record<
    string,
    Array<{
      stk: string;
      veh?: string | null;
      body?: string | null;
      age?: number | null;
      ph?: number | null;
      cost?: number | null;
      price?: number | null;
      pom?: number | null;
      dsr?: number | null;
      srp?: number | null;
      vdp?: number | null;
      vr?: number | null;
      mmr?: number | null;
      jd?: number | null;
      pt?: string | null;
      disp?: string | null;
    }>
  >;
};

export type SeedHistoryResult = {
  metricsUpserted: number;
  movementsInserted: number;
  priceActionsInserted: number;
  snapshotsCreated: number;
  unitsInserted: number;
};

export async function seedInventoryHistory(
  supabase: SupabaseClient,
  payload: HistorySeedPayload
): Promise<SeedHistoryResult> {
  const { storeId } = payload;
  if (!storeId) throw new Error("storeId is required");

  let metricsUpserted = 0;
  let movementsInserted = 0;
  let priceActionsInserted = 0;
  let snapshotsCreated = 0;
  let unitsInserted = 0;

  if (payload.series?.length) {
    const rows = payload.series.map((s) => ({
      store_id: storeId,
      snapshot_date: s.snapshot_date,
      units: s.units ?? 0,
      avg_age: s.avg_age ?? null,
      over60: s.over60 ?? 0,
      over90: s.over90 ?? 0,
      full_photos: s.full_photos ?? 0,
      no_ph: s.no_ph ?? 0,
      stale: s.stale ?? 0,
      no_price: s.no_price ?? 0,
      hot: s.hot ?? 0,
      hot_cost: s.hot_cost ?? 0,
      ttl_fail: s.ttl_fail ?? null,
      retail_count: s.retail_count ?? 0,
      subprime_count: s.subprime_count ?? 0,
    }));
    const { error } = await supabase.from("inv_daily_metrics").upsert(rows, {
      onConflict: "store_id,snapshot_date",
    });
    if (error) throw new Error(`seed metrics: ${error.message}`);
    metricsUpserted = rows.length;
  }

  if (payload.movements?.length) {
    // Replace overlapping dates for this store
    const dates = [...new Set(payload.movements.map((m) => m.movement_date))];
    for (const d of dates) {
      await supabase.from("inv_movements").delete().eq("store_id", storeId).eq("movement_date", d);
    }
    const { error } = await supabase.from("inv_movements").insert(
      payload.movements.map((m) => ({ ...m, store_id: storeId }))
    );
    if (error) throw new Error(`seed movements: ${error.message}`);
    movementsInserted = payload.movements.length;
  }

  if (payload.priceActions?.length) {
    const dates = [...new Set(payload.priceActions.map((m) => m.action_date))];
    for (const d of dates) {
      await supabase
        .from("inv_price_actions")
        .delete()
        .eq("store_id", storeId)
        .eq("action_date", d);
    }
    const { error } = await supabase.from("inv_price_actions").insert(
      payload.priceActions.map((m) => ({ ...m, store_id: storeId }))
    );
    if (error) throw new Error(`seed price_actions: ${error.message}`);
    priceActionsInserted = payload.priceActions.length;
  }

  if (payload.unitsByDate) {
    for (const [date, units] of Object.entries(payload.unitsByDate)) {
      const { data: existing } = await supabase
        .from("inv_snapshots")
        .select("id")
        .eq("store_id", storeId)
        .eq("snapshot_date", date)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from("inv_snapshots").delete().eq("id", existing.id);
      }
      const { data: snap, error: snapErr } = await supabase
        .from("inv_snapshots")
        .insert({
          store_id: storeId,
          snapshot_date: date,
          source_filename: "history-seed",
          row_count: units.length,
        })
        .select("id")
        .single();
      if (snapErr || !snap) throw new Error(`seed snapshot ${date}: ${snapErr?.message}`);
      snapshotsCreated += 1;

      const rows = units.map((u) => ({
        snapshot_id: snap.id,
        stk: u.stk,
        veh: u.veh ?? null,
        body: u.body ?? null,
        age: u.age ?? null,
        ph: u.ph ?? null,
        cost: u.cost ?? null,
        price: u.price ?? null,
        pom: u.pom ?? null,
        dsr: u.dsr ?? null,
        srp: u.srp ?? null,
        vdp: u.vdp ?? null,
        vr: u.vr ?? null,
        mmr: u.mmr ?? null,
        jd: u.jd ?? null,
        pt: u.pt ?? null,
        disp: (u.disp ?? "retail").toLowerCase() === "subprime" ? "subprime" : "retail",
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("inv_units").insert(rows.slice(i, i + 200));
        if (error) throw new Error(`seed units ${date}: ${error.message}`);
      }
      unitsInserted += rows.length;
    }
  }

  return {
    metricsUpserted,
    movementsInserted,
    priceActionsInserted,
    snapshotsCreated,
    unitsInserted,
  };
}
