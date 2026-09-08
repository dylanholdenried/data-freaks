/**
 * When a Sales Registry deal matches an active Acquire purchase, nudge stage → pending_sale.
 * Does NOT copy any deal economics into Acquire.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACQ_ACTIVE_STAGES, type AcqPurchaseStage } from "./types";

const NUDGEABLE = new Set<string>(
  ACQ_ACTIVE_STAGES.filter((s) => s !== "pending_sale")
);

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

export async function nudgePurchasesToPendingSale(
  supabase: SupabaseClient,
  opts: {
    storeId: string;
    stockNumber?: string | null;
    vin?: string | null;
    actorProfileId?: string | null;
  }
): Promise<number> {
  const stock = norm(opts.stockNumber);
  const vin = norm(opts.vin);
  if (!stock && !vin) return 0;

  const { data: rows, error } = await supabase
    .from("acq_purchases")
    .select("id, stage, stock_number, vin")
    .eq("store_id", opts.storeId)
    .in("stage", Array.from(NUDGEABLE));

  if (error || !rows?.length) return 0;

  const matches = rows.filter((r) => {
    const rs = norm(r.stock_number);
    const rv = norm(r.vin);
    if (stock && rs && rs === stock) return true;
    if (vin && rv && rv === vin) return true;
    return false;
  });

  let updated = 0;
  const now = new Date().toISOString();
  for (const m of matches) {
    const fromStage = m.stage as AcqPurchaseStage;
    const { error: upErr } = await supabase
      .from("acq_purchases")
      .update({
        stage: "pending_sale",
        updated_at: now,
        updated_by: opts.actorProfileId ?? null,
      })
      .eq("id", m.id)
      .in("stage", Array.from(NUDGEABLE));

    if (upErr) {
      console.error("Acquire pending_sale nudge failed", m.id, upErr);
      continue;
    }

    await supabase.from("acq_stage_events").insert({
      purchase_id: m.id,
      from_stage: fromStage,
      to_stage: "pending_sale",
      actor_profile_id: opts.actorProfileId ?? null,
      note: "Auto: matched Sales Registry deal",
    });
    updated += 1;
  }

  return updated;
}

/** Find a deal for discrepancy compare (does not mutate). */
export async function findMatchingDeal(
  supabase: SupabaseClient,
  opts: { storeId: string; stockNumber?: string | null; vin?: string | null }
) {
  const stock = (opts.stockNumber ?? "").trim();
  const vin = (opts.vin ?? "").trim();

  if (stock) {
    const { data } = await supabase
      .from("deals")
      .select(
        "id, status, stock_number, vin, sale_price, front_profit, back_profit, sale_date"
      )
      .eq("store_id", opts.storeId)
      .ilike("stock_number", stock)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (vin.length === 17) {
    const { data } = await supabase
      .from("deals")
      .select(
        "id, status, stock_number, vin, sale_price, front_profit, back_profit, sale_date"
      )
      .eq("store_id", opts.storeId)
      .ilike("vin", vin)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}
