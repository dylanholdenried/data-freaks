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

/** Refresh `live_synced_at` on unchanged matches at most this often. */
const SYNC_STAMP_STALE_MS = 6 * 60 * 60 * 1000;

function normKey(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

function sameNum(a: number | string | null | undefined, b: number | string | null | undefined) {
  if (a == null || b == null) return a == null && b == null;
  return Number(a) === Number(b);
}

type PurchaseOverlayRow = {
  id: string;
  stock_number: string | null;
  stage: string;
  live_matched: boolean | null;
  live_cost: number | null;
  live_mmr: number | null;
  live_jd: number | null;
  live_price: number | null;
  live_pom: number | null;
  live_srp: number | null;
  live_vdp: number | null;
  live_photo_count: number | null;
  live_age: number | null;
  live_synced_at: string | null;
  frozen_mmr: number | null;
  frozen_jd: number | null;
  frozen_at: string | null;
};

function liveOverlayUnchanged(p: PurchaseOverlayRow, u: InvUnit): boolean {
  return (
    p.live_matched === true &&
    p.frozen_at == null &&
    sameNum(p.live_cost, u.cost) &&
    sameNum(p.live_mmr, u.mmr) &&
    sameNum(p.live_jd, u.jd) &&
    sameNum(p.live_price, u.price) &&
    sameNum(p.live_pom, u.pom) &&
    sameNum(p.live_srp, u.srp) &&
    sameNum(p.live_vdp, u.vdp) &&
    sameNum(p.live_photo_count, u.ph) &&
    sameNum(p.live_age, u.age)
  );
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
      "id, stock_number, stage, live_matched, live_cost, live_mmr, live_jd, live_price, live_pom, live_srp, live_vdp, live_photo_count, live_age, live_synced_at, frozen_mmr, frozen_jd, frozen_at"
    )
    .eq("store_id", storeId);

  if (purchErr || !purchases?.length) {
    if (purchErr) console.error("Acquire overlay: failed to load purchases", purchErr);
    return { matched: 0, frozen: 0 };
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  let matched = 0;
  let frozen = 0;
  const stampOnlyIds: string[] = [];
  const unmatchIds: string[] = [];

  for (const p of purchases as PurchaseOverlayRow[]) {
    const stock = normKey(p.stock_number);
    const unit = stock ? byStock.get(stock) : undefined;
    const isActive = (ACQ_ACTIVE_STAGES as readonly string[]).includes(p.stage);

    if (unit && liveOverlayUnchanged(p, unit)) {
      matched += 1;
      const syncedMs = p.live_synced_at ? Date.parse(p.live_synced_at) : 0;
      if (!(nowMs - syncedMs < SYNC_STAMP_STALE_MS)) stampOnlyIds.push(p.id);
    } else if (unit) {
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
    } else if (p.live_matched) {
      // Clear live match flag if stock no longer on lot (already frozen or never matched)
      unmatchIds.push(p.id);
    }
  }

  if (stampOnlyIds.length) {
    const { error } = await supabase
      .from("acq_purchases")
      .update({ live_synced_at: now })
      .in("id", stampOnlyIds);
    if (error) console.error("Acquire overlay sync stamp failed", error);
  }

  if (unmatchIds.length) {
    const { error } = await supabase
      .from("acq_purchases")
      .update({
        live_matched: false,
        live_synced_at: now,
        updated_at: now,
      })
      .in("id", unmatchIds)
      .eq("live_matched", true);
    if (error) console.error("Acquire overlay unmatch failed", error);
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
