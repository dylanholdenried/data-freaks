"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertNotImpersonating } from "@/lib/impersonation";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { assertStoreAccess } from "@/lib/store-access";
import { canMutateAcquire } from "@/lib/roles";
import { computeIsIncoming } from "@/lib/acquire/incoming";
import {
  ACQ_EXIT_STRATEGIES,
  ACQ_STAGES,
  normalizeSourceType,
  type AcqExitStrategy,
  type AcqPurchaseStage,
  type AcqSourceType,
} from "@/lib/acquire/types";
import { nudgePurchasesToPendingSale } from "@/lib/acquire/pending-sale";

export type AcqActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

type AcquireMutatorOk = {
  ok: true;
  supabase: ReturnType<typeof createSupabaseServerClient>;
  profile: { id: string; dealer_group_id: string | null; role: string | null; status: string };
  dealerGroupId: string;
  user: { id: string };
};

async function requireAcquireMutator(): Promise<AcquireMutatorOk | { ok: false; error: string }> {
  await assertNotImpersonating();
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    return { ok: false, error: "Profile inactive" };
  }
  if (!canMutateAcquire(profile.role)) {
    return { ok: false, error: "Only platform admins can edit Acquire purchases." };
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) return { ok: false, error: "Select an Auto Group first." };

  return {
    ok: true,
    supabase,
    profile: {
      id: profile.id,
      dealer_group_id: profile.dealer_group_id,
      role: profile.role,
      status: profile.status,
    },
    dealerGroupId,
    user,
  };
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  const n = parseNum(v);
  if (n == null) return null;
  return Math.round(n);
}

function parseBool(v: FormDataEntryValue | null): boolean {
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "on" || s === "1";
}

function parseSource(v: FormDataEntryValue | null): AcqSourceType {
  return normalizeSourceType(String(v ?? "auction"));
}

function parseStage(v: FormDataEntryValue | null): AcqPurchaseStage {
  const s = String(v ?? "need_to_stock_in");
  return (ACQ_STAGES as readonly string[]).includes(s)
    ? (s as AcqPurchaseStage)
    : "need_to_stock_in";
}

function parseExitStrategy(v: FormDataEntryValue | null): AcqExitStrategy | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "retail") return "prime";
  if (s === "wholesale_sold") return "wholesale";
  return (ACQ_EXIT_STRATEGIES as readonly string[]).includes(s)
    ? (s as AcqExitStrategy)
    : null;
}

function revalidateAcquire() {
  revalidatePath("/app/acquire/purchases");
  revalidatePath("/app/acquire/performance");
  revalidatePath("/app/setup");
}

export async function createAcquirePurchase(
  formData: FormData
): Promise<AcqActionResult> {
  try {
    const ctx = await requireAcquireMutator();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const storeId = emptyToNull(formData.get("store_id"));
    if (!storeId) return { ok: false, error: "Dealership is required." };

    if (!(await assertStoreAccess(ctx.supabase, ctx.profile, storeId))) {
      return { ok: false, error: "No access to that store." };
    }

    const { data: store } = await ctx.supabase
      .from("stores")
      .select("id, dealer_group_id")
      .eq("id", storeId)
      .maybeSingle();

    if (!store || store.dealer_group_id !== ctx.dealerGroupId) {
      return { ok: false, error: "Store does not belong to the selected Auto Group." };
    }

    const seller = emptyToNull(formData.get("seller_name"));
    const payload = {
      store_id: storeId,
      dealer_group_id: store.dealer_group_id,
      stage: parseStage(formData.get("stage")),
      buyer_id: emptyToNull(formData.get("buyer_id")),
      stock_number: emptyToNull(formData.get("stock_number")),
      vin: emptyToNull(formData.get("vin")),
      vehicle_year: parseIntOrNull(formData.get("vehicle_year")),
      vehicle_make: emptyToNull(formData.get("vehicle_make")),
      vehicle_model: emptyToNull(formData.get("vehicle_model")),
      vehicle_trim: emptyToNull(formData.get("vehicle_trim")),
      color: emptyToNull(formData.get("color")),
      odometer: parseIntOrNull(formData.get("odometer")),
      source_type: parseSource(formData.get("source_type")),
      seller_name: seller,
      auction_house: seller,
      purchase_date: emptyToNull(formData.get("purchase_date")),
      purchase_price: parseNum(formData.get("purchase_price")),
      created_by: ctx.profile.id,
      updated_by: ctx.profile.id,
    };

    const is_incoming = computeIsIncoming(payload);

    const { data, error } = await ctx.supabase
      .from("acq_purchases")
      .insert({ ...payload, is_incoming })
      .select("id")
      .single();

    if (error) {
      console.error("createAcquirePurchase", error);
      return { ok: false, error: error.message };
    }

    await ctx.supabase.from("acq_stage_events").insert({
      purchase_id: data.id,
      from_stage: null,
      to_stage: payload.stage,
      actor_profile_id: ctx.profile.id,
      note: "Created",
    });

    if (payload.stock_number) {
      try {
        const service = createSupabaseServiceClient();
        const { syncAcquireOverlaysForStoresLatest } = await import(
          "@/lib/acquire/sync-inventory"
        );
        await syncAcquireOverlaysForStoresLatest(service, [payload.store_id]);
      } catch (syncErr) {
        console.error("Acquire overlay sync after create", syncErr);
      }
    }

    revalidateAcquire();
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create purchase",
    };
  }
}

export async function updateAcquirePurchase(
  purchaseId: string,
  formData: FormData
): Promise<AcqActionResult> {
  try {
    const ctx = await requireAcquireMutator();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!purchaseId) return { ok: false, error: "Missing purchase id." };

    const { data: existing, error: loadErr } = await ctx.supabase
      .from("acq_purchases")
      .select("id, store_id, stage, dealer_group_id")
      .eq("id", purchaseId)
      .maybeSingle();

    if (loadErr || !existing) return { ok: false, error: "Purchase not found." };
    if (existing.dealer_group_id !== ctx.dealerGroupId) {
      return { ok: false, error: "Purchase is outside the selected Auto Group." };
    }
    if (!(await assertStoreAccess(ctx.supabase, ctx.profile, existing.store_id))) {
      return { ok: false, error: "No access to that store." };
    }

    const nextStage = formData.has("stage")
      ? parseStage(formData.get("stage"))
      : (existing.stage as AcqPurchaseStage);

    const seller = emptyToNull(formData.get("seller_name"));
    const hasTrade = parseBool(formData.get("has_trade"));

    const patch = {
      stage: nextStage,
      buyer_id: emptyToNull(formData.get("buyer_id")),
      stock_number: emptyToNull(formData.get("stock_number")),
      vin: emptyToNull(formData.get("vin")),
      vehicle_year: parseIntOrNull(formData.get("vehicle_year")),
      vehicle_make: emptyToNull(formData.get("vehicle_make")),
      vehicle_model: emptyToNull(formData.get("vehicle_model")),
      vehicle_trim: emptyToNull(formData.get("vehicle_trim")),
      color: emptyToNull(formData.get("color")),
      odometer: parseIntOrNull(formData.get("odometer")),
      source_type: parseSource(formData.get("source_type")),
      seller_name: seller,
      auction_house: seller,
      cr_grade: emptyToNull(formData.get("cr_grade")),
      purchase_date: emptyToNull(formData.get("purchase_date")),
      purchase_price: parseNum(formData.get("purchase_price")),
      auction_fees: parseNum(formData.get("auction_fees")),
      transport_cost: parseNum(formData.get("transport_cost")),
      recon_estimate: parseNum(formData.get("recon_estimate")),
      purchase_mmr: parseNum(formData.get("purchase_mmr")),
      purchase_jd: parseNum(formData.get("purchase_jd")),
      recon_cost: parseNum(formData.get("recon_cost")),
      delivery_date: emptyToNull(formData.get("delivery_date")),
      recon_description_done: parseBool(formData.get("recon_description_done")),
      recon_merchandising_done: parseBool(formData.get("recon_merchandising_done")),
      recon_frontline_done: parseBool(formData.get("recon_frontline_done")),
      frontline_date: emptyToNull(formData.get("frontline_date")),
      website_price: parseNum(formData.get("website_price")),
      sold_date: emptyToNull(formData.get("sold_date")),
      sold_price: parseNum(formData.get("sold_price")),
      front_gross: parseNum(formData.get("front_gross")),
      back_gross: parseNum(formData.get("back_gross")),
      total_gross: parseNum(formData.get("total_gross")),
      next_store_profit: parseNum(formData.get("next_store_profit")),
      exit_strategy: parseExitStrategy(formData.get("exit_strategy")),
      has_trade: hasTrade,
      trade_stock_number: hasTrade ? emptyToNull(formData.get("trade_stock_number")) : null,
      trade_vin: hasTrade ? emptyToNull(formData.get("trade_vin")) : null,
      trade_year: hasTrade ? parseIntOrNull(formData.get("trade_year")) : null,
      trade_make: hasTrade ? emptyToNull(formData.get("trade_make")) : null,
      trade_model: hasTrade ? emptyToNull(formData.get("trade_model")) : null,
      trade_acv: hasTrade ? parseNum(formData.get("trade_acv")) : null,
      trade_allowance: hasTrade ? parseNum(formData.get("trade_allowance")) : null,
      updated_by: ctx.profile.id,
      updated_at: new Date().toISOString(),
    };

    const is_incoming = computeIsIncoming(patch);

    const { error } = await ctx.supabase
      .from("acq_purchases")
      .update({ ...patch, is_incoming })
      .eq("id", purchaseId);

    if (error) {
      console.error("updateAcquirePurchase", error);
      return { ok: false, error: error.message };
    }

    if (nextStage !== existing.stage) {
      await ctx.supabase.from("acq_stage_events").insert({
        purchase_id: purchaseId,
        from_stage: existing.stage,
        to_stage: nextStage,
        actor_profile_id: ctx.profile.id,
      });
    }

    if (patch.stock_number) {
      try {
        const service = createSupabaseServiceClient();
        const { syncAcquireOverlaysForStoresLatest } = await import(
          "@/lib/acquire/sync-inventory"
        );
        await syncAcquireOverlaysForStoresLatest(service, [existing.store_id]);
      } catch (syncErr) {
        console.error("Acquire overlay sync after update", syncErr);
      }
    }

    revalidateAcquire();
    return { ok: true, id: purchaseId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update purchase",
    };
  }
}

export async function updateAcquirePurchaseStage(
  purchaseId: string,
  stage: string
): Promise<AcqActionResult> {
  try {
    const ctx = await requireAcquireMutator();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!(ACQ_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, error: "Invalid stage." };
    }

    const { data: existing, error: loadErr } = await ctx.supabase
      .from("acq_purchases")
      .select("id, store_id, stage, dealer_group_id")
      .eq("id", purchaseId)
      .maybeSingle();

    if (loadErr || !existing) return { ok: false, error: "Purchase not found." };
    if (existing.dealer_group_id !== ctx.dealerGroupId) {
      return { ok: false, error: "Purchase is outside the selected Auto Group." };
    }

    if (existing.stage === stage) return { ok: true, id: purchaseId };

    const { error } = await ctx.supabase
      .from("acq_purchases")
      .update({
        stage,
        updated_by: ctx.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId);

    if (error) return { ok: false, error: error.message };

    await ctx.supabase.from("acq_stage_events").insert({
      purchase_id: purchaseId,
      from_stage: existing.stage,
      to_stage: stage,
      actor_profile_id: ctx.profile.id,
    });

    revalidateAcquire();
    return { ok: true, id: purchaseId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update stage",
    };
  }
}

export async function maybeNudgeAcquirePendingSale(opts: {
  storeId: string;
  stockNumber?: string | null;
  vin?: string | null;
  actorProfileId?: string | null;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    const n = await nudgePurchasesToPendingSale(service, opts);
    if (n > 0) revalidateAcquire();
  } catch (e) {
    console.error("maybeNudgeAcquirePendingSale", e);
  }
}
