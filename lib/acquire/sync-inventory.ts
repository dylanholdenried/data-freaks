/**
 * Sync Acquire live inventory overlays from Inventory Command snapshots.
 * Never touches manual purchase fields (purchase_*, stage, exit econ).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACQ_ACTIVE_STAGES } from "./types";

type InvUnit = {
  stk: string | null;
  cost: number | null;
  mmr: number | null;
  jd: number | null;
  price: number | null;
  pom: number | null;
  srp: number | null;
  vdp: number | null;
  ph: number | null;
  age: number | null;
};

function normKey(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

export async function syncAcquireOverlaysForStore(
  supabase: SupabaseClient,
  storeId: string,
  snapshotId: string
): Promise<{ matched: number; frozen: number }> {
  const { data: units, error: unitsErr } = await supabase
    .from("inv_units")
    .select("stk, cost, mmr, jd, price, pom, srp, vdp, ph, age")
    .eq("snapshot_id", snapshotId);

  if (unitsErr) {
    console.error("Acquire overlay: failed to load inv_units", unitsErr);
    return { matched: 0, frozen: 0 };
  }

  const byStock = new Map<string, InvUnit>();
  for (const u of (units ?? []) as InvUnit[]) {
    const key = normKey(u.stk);
    if (key) byStock.set(key, u);
  }

  const { data: purchases, error: purchErr } = await supabase
    .from("acq_purchases")
    .select(
      "id, stock_number, stage, live_matched, live_mmr, live_jd, frozen_mmr, frozen_jd, frozen_at"
    )
    .eq("store_id", storeId);

  if (purchErr || !purchases?.length) {
    if (purchErr) console.error("Acquire overlay: failed to load purchases", purchErr);
    return { matched: 0, frozen: 0 };
  }

  const now = new Date().toISOString();
  let matched = 0;
  let frozen = 0;

  for (const p of purchases) {
    const stock = normKey(p.stock_number);
    const unit = stock ? byStock.get(stock) : undefined;
    const isActive = (ACQ_ACTIVE_STAGES as readonly string[]).includes(p.stage);

    if (unit) {
      matched += 1;
      const { error } = await supabase
        .from("acq_purchases")
        .update({
          live_matched: true,
          live_cost: unit.cost,
          live_mmr: unit.mmr,
          live_jd: unit.jd,
          live_price: unit.price,
          live_pom: unit.pom,
          live_srp: unit.srp,
          live_vdp: unit.vdp,
          live_photo_count: unit.ph,
          live_age: unit.age,
          live_synced_at: now,
          // Rematch clears a prior freeze so books go live again
          frozen_mmr: null,
          frozen_jd: null,
          frozen_at: null,
          updated_at: now,
        })
        .eq("id", p.id);
      if (error) console.error("Acquire overlay update failed", p.id, error);
    } else if (isActive && p.live_matched && p.frozen_at == null) {
      // Was matched before; missing from latest snapshot → freeze last live books
      frozen += 1;
      const { error } = await supabase
        .from("acq_purchases")
        .update({
          live_matched: false,
          frozen_mmr: p.live_mmr,
          frozen_jd: p.live_jd,
          frozen_at: now,
          live_synced_at: now,
          updated_at: now,
        })
        .eq("id", p.id)
        .is("frozen_at", null);
      if (error) console.error("Acquire freeze failed", p.id, error);
    } else if (!unit) {
      // Clear live match flag if stock no longer on lot (already frozen or never matched)
      await supabase
        .from("acq_purchases")
        .update({
          live_matched: false,
          live_synced_at: now,
          updated_at: now,
        })
        .eq("id", p.id)
        .eq("live_matched", true);
    }
  }

  return { matched, frozen };
}

/** Sync each store from its latest inventory snapshot (by snapshot_date, then created_at). */
export async function syncAcquireOverlaysForStoresLatest(
  supabase: SupabaseClient,
  storeIds: string[]
): Promise<{ matched: number; frozen: number }> {
  const unique = Array.from(new Set(storeIds.filter(Boolean)));
  if (!unique.length) return { matched: 0, frozen: 0 };

  let matched = 0;
  let frozen = 0;

  for (const storeId of unique) {
    const { data: snap, error } = await supabase
      .from("inv_snapshots")
      .select("id")
      .eq("store_id", storeId)
      .order("snapshot_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Acquire overlay: latest snapshot lookup failed", storeId, error);
      continue;
    }
    if (!snap?.id) continue;

    const result = await syncAcquireOverlaysForStore(supabase, storeId, snap.id);
    matched += result.matched;
    frozen += result.frozen;
  }

  return { matched, frozen };
}
