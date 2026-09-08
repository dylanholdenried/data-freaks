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
  type AcqPurchase,
  type AcqPurchaseStage,
  type AcqSourceType,
} from "@/lib/acquire/types";
import { nudgePurchasesToPendingSale } from "@/lib/acquire/pending-sale";

export type AcqActionResult =
  | { ok: true; id?: string; purchase?: AcqPurchase }
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
      on_hold: parseBool(formData.get("on_hold")),
      buyer_id: emptyToNull(formData.get("buyer_id")),
      stock_number: emptyToNull(formData.get("stock_number")),
      vin: emptyToNull(formData.get("vin")),
      vehicle_year: parseIntOrNull(formData.get("vehicle_year")),
      vehicle_make: emptyToNull(formData.get("vehicle_make")),
      vehicle_model: emptyToNull(formData.get("vehicle_model")),
      vehicle_trim: emptyToNull(formData.get("vehicle_trim")),
      color: emptyToNull(formData.get("color")),
      body_style: emptyToNull(formData.get("body_style")),
      drivetrain: emptyToNull(formData.get("drivetrain")),
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
    const onHold = formData.has("on_hold")
      ? parseBool(formData.get("on_hold"))
      : undefined;

    const patch = {
      stage: nextStage,
      ...(onHold !== undefined ? { on_hold: onHold } : {}),
      buyer_id: emptyToNull(formData.get("buyer_id")),
      stock_number: emptyToNull(formData.get("stock_number")),
      vin: emptyToNull(formData.get("vin")),
      vehicle_year: parseIntOrNull(formData.get("vehicle_year")),
      vehicle_make: emptyToNull(formData.get("vehicle_make")),
      vehicle_model: emptyToNull(formData.get("vehicle_model")),
      vehicle_trim: emptyToNull(formData.get("vehicle_trim")),
      color: emptyToNull(formData.get("color")),
      body_style: emptyToNull(formData.get("body_style")),
      drivetrain: emptyToNull(formData.get("drivetrain")),
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

    const { data: updated, error } = await ctx.supabase
      .from("acq_purchases")
      .update({ ...patch, is_incoming })
      .eq("id", purchaseId)
      .select("*")
      .single();

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
    return { ok: true, id: purchaseId, purchase: updated as AcqPurchase };
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

    const { data: updated, error } = await ctx.supabase
      .from("acq_purchases")
      .update({
        stage,
        updated_by: ctx.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId)
      .select("*")
      .single();

    if (error) return { ok: false, error: error.message };

    await ctx.supabase.from("acq_stage_events").insert({
      purchase_id: purchaseId,
      from_stage: existing.stage,
      to_stage: stage,
      actor_profile_id: ctx.profile.id,
    });

    revalidateAcquire();
    return { ok: true, id: purchaseId, purchase: updated as AcqPurchase };
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

export async function getAcquirePurchasesTemplateCsvAction(): Promise<string> {
  const ctx = await requireAcquireMutator();
  if (!ctx.ok) throw new Error(ctx.error);
  const { buildAcquirePurchasesCsvTemplate } = await import("@/lib/acquire/bulk-upload");
  return buildAcquirePurchasesCsvTemplate();
}

export type AcqBulkUploadResult =
  | {
      ok: true;
      dryRun: false;
      inserted: number;
      skipped: number;
      warnings: string[];
      summary: string;
      liveMatched: number;
    }
  | {
      ok: true;
      dryRun: true;
      inserted: 0;
      skipped: number;
      warnings: string[];
      summary: string;
      preview: import("@/lib/acquire/bulk-upload").AcqBulkPreviewSummary;
    }
  | { ok: false; error: string; warnings?: string[] };

export async function bulkUploadAcquirePurchasesAction(
  formData: FormData
): Promise<AcqBulkUploadResult> {
  try {
    const ctx = await requireAcquireMutator();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const dryRun = String(formData.get("dry_run") ?? "") === "true";

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a CSV file." };
    }

    const text = await file.text();
    const {
      parseAcquirePurchasesCsv,
      matchStoreId,
      matchBuyerId,
      stockStoreKey,
      isBodyStyleInCatalog,
      isColorInCatalog,
      isDrivetrainInCatalog,
      formatBulkUploadSummary,
    } = await import("@/lib/acquire/bulk-upload");
    const { computeIsIncoming } = await import("@/lib/acquire/incoming");

    const parsed = parseAcquirePurchasesCsv(text);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, warnings: parsed.warnings };
    }

    const warnings = [...parsed.warnings];

    const [{ data: storeRows }, { data: buyerRows }, { data: existingRows }] = await Promise.all([
      ctx.supabase
        .from("stores")
        .select("id, name, dealer_group_id")
        .eq("dealer_group_id", ctx.dealerGroupId),
      ctx.supabase
        .from("acq_buyers")
        .select("id, name, active")
        .eq("dealer_group_id", ctx.dealerGroupId),
      ctx.supabase
        .from("acq_purchases")
        .select("store_id, stock_number")
        .eq("dealer_group_id", ctx.dealerGroupId)
        .not("stock_number", "is", null),
    ]);

    const stores = (storeRows ?? []).map((s) => ({ id: s.id, name: s.name }));
    const storeNameById = Object.fromEntries(stores.map((s) => [s.id, s.name]));
    const buyers = (buyerRows ?? []) as { id: string; name: string; active: boolean }[];
    const existingKeys = new Set(
      (existingRows ?? [])
        .map((r) => stockStoreKey(r.store_id, r.stock_number))
        .filter((k): k is string => Boolean(k))
    );

    const inserts: Record<string, unknown>[] = [];
    let skipped = 0;
    let duplicateInFile = 0;
    let duplicateExisting = 0;
    let unknownDealership = 0;
    let missingStock = 0;
    let missingPurchasePrice = 0;
    let bodyOutOfCatalog = 0;
    let colorOutOfCatalog = 0;
    let drivetrainOutOfCatalog = 0;
    const storeCounts = new Map<string, number>();
    const seenInFile = new Set<string>();
    const storeIdsToSync = new Set<string>();

    for (const row of parsed.rows) {
      const storeId = matchStoreId(row.dealership, stores);
      if (!storeId) {
        warnings.push(`Row ${row.rowNumber}: unknown dealership "${row.dealership}" — skipped.`);
        skipped += 1;
        unknownDealership += 1;
        continue;
      }
      if (!(await assertStoreAccess(ctx.supabase, ctx.profile, storeId))) {
        warnings.push(`Row ${row.rowNumber}: no access to "${row.dealership}" — skipped.`);
        skipped += 1;
        continue;
      }

      const key = stockStoreKey(storeId, row.stock_number);
      if (key) {
        if (seenInFile.has(key)) {
          warnings.push(
            `Row ${row.rowNumber}: duplicate stock "${row.stock_number}" in this file for ${storeNameById[storeId]} — skipped.`
          );
          skipped += 1;
          duplicateInFile += 1;
          continue;
        }
        if (existingKeys.has(key)) {
          warnings.push(
            `Row ${row.rowNumber}: stock "${row.stock_number}" already exists at ${storeNameById[storeId]} — skipped.`
          );
          skipped += 1;
          duplicateExisting += 1;
          continue;
        }
        seenInFile.add(key);
      } else {
        missingStock += 1;
      }

      if (row.purchase_price == null) missingPurchasePrice += 1;
      if (!isBodyStyleInCatalog(row.body_style)) bodyOutOfCatalog += 1;
      if (!isColorInCatalog(row.color)) colorOutOfCatalog += 1;
      if (!isDrivetrainInCatalog(row.drivetrain)) drivetrainOutOfCatalog += 1;

      let buyerId = matchBuyerId(row.buyerName, buyers);
      if (row.buyerName && !buyerId) {
        warnings.push(
          `Row ${row.rowNumber}: buyer "${row.buyerName}" not found in Setup — purchase will save without buyer.`
        );
      }

      const storeLabel = storeNameById[storeId] ?? row.dealership;
      storeCounts.set(storeLabel, (storeCounts.get(storeLabel) ?? 0) + 1);

      const hasTrade = row.has_trade;
      const payload = {
        store_id: storeId,
        dealer_group_id: ctx.dealerGroupId,
        stage: row.status,
        buyer_id: buyerId,
        stock_number: row.stock_number,
        vin: row.vin,
        vehicle_year: row.vehicle_year,
        vehicle_make: row.vehicle_make,
        vehicle_model: row.vehicle_model,
        vehicle_trim: row.vehicle_trim,
        color: row.color,
        body_style: row.body_style,
        drivetrain: row.drivetrain,
        odometer: row.odometer,
        source_type: row.source_type,
        seller_name: row.seller_name,
        auction_house: row.seller_name,
        purchase_date: row.purchase_date,
        cr_grade: row.cr_grade,
        purchase_price: row.purchase_price,
        auction_fees: row.auction_fees,
        transport_cost: row.transport_cost,
        recon_estimate: row.recon_estimate,
        purchase_mmr: row.purchase_mmr,
        purchase_jd: row.purchase_jd,
        delivery_date: row.delivery_date,
        frontline_date: row.frontline_date,
        recon_cost: row.recon_cost,
        recon_description_done: row.recon_description_done,
        recon_merchandising_done: row.recon_merchandising_done,
        recon_frontline_done: row.recon_frontline_done,
        sold_date: row.sold_date,
        sold_price: row.sold_price,
        exit_strategy: row.exit_strategy,
        front_gross: row.front_gross,
        back_gross: row.back_gross,
        total_gross: row.total_gross,
        next_store_profit:
          row.exit_strategy === "internal_transfer" ? row.next_store_profit : null,
        has_trade: hasTrade,
        trade_stock_number: hasTrade ? row.trade_stock_number : null,
        trade_vin: hasTrade ? row.trade_vin : null,
        trade_year: hasTrade ? row.trade_year : null,
        trade_make: hasTrade ? row.trade_make : null,
        trade_model: hasTrade ? row.trade_model : null,
        trade_acv: hasTrade ? row.trade_acv : null,
        trade_allowance: hasTrade ? row.trade_allowance : null,
        created_by: ctx.profile.id,
        updated_by: ctx.profile.id,
      };

      const is_incoming = computeIsIncoming(payload);
      inserts.push({ ...payload, is_incoming });
      storeIdsToSync.add(storeId);
    }

    const preview = {
      rowsParsed: parsed.rows.length,
      wouldInsert: inserts.length,
      wouldSkip: skipped,
      missingStock,
      missingPurchasePrice,
      bodyOutOfCatalog,
      colorOutOfCatalog,
      drivetrainOutOfCatalog,
      duplicateInFile,
      duplicateExisting,
      unknownDealership,
      storeCounts: Array.from(storeCounts.entries())
        .map(([store, count]) => ({ store, count }))
        .sort((a, b) => b.count - a.count),
    };

    if (dryRun) {
      const summaryBits = [
        `Preview: ${preview.wouldInsert} ready to import`,
        preview.wouldSkip ? `${preview.wouldSkip} would skip` : null,
        preview.duplicateExisting || preview.duplicateInFile
          ? `${preview.duplicateExisting + preview.duplicateInFile} duplicate stock`
          : null,
        preview.bodyOutOfCatalog ? `${preview.bodyOutOfCatalog} body style out of catalog` : null,
        preview.missingStock ? `${preview.missingStock} missing stock` : null,
      ].filter(Boolean);
      return {
        ok: true,
        dryRun: true,
        inserted: 0,
        skipped,
        warnings,
        summary: summaryBits.join(" · ") + ".",
        preview,
      };
    }

    if (!inserts.length) {
      return {
        ok: false,
        error: "No rows could be imported. Check dealership names and duplicates.",
        warnings,
      };
    }

    const { data: inserted, error } = await ctx.supabase
      .from("acq_purchases")
      .insert(inserts)
      .select("id, stage");

    if (error) {
      console.error("bulkUploadAcquirePurchases", error);
      return { ok: false, error: error.message, warnings };
    }

    const created = inserted ?? [];
    if (created.length) {
      await ctx.supabase.from("acq_stage_events").insert(
        created.map((r) => ({
          purchase_id: r.id,
          from_stage: null,
          to_stage: r.stage,
          actor_profile_id: ctx.profile.id,
          note: "Bulk upload",
        }))
      );
    }

    try {
      const service = createSupabaseServiceClient();
      const { syncAcquireOverlaysForStoresLatest } = await import(
        "@/lib/acquire/sync-inventory"
      );
      await syncAcquireOverlaysForStoresLatest(service, Array.from(storeIdsToSync));
    } catch (syncErr) {
      console.error("Acquire overlay sync after bulk upload", syncErr);
    }

    let liveMatched = 0;
    if (created.length) {
      const { data: matchedRows } = await ctx.supabase
        .from("acq_purchases")
        .select("id")
        .in(
          "id",
          created.map((r) => r.id)
        )
        .eq("live_matched", true);
      liveMatched = matchedRows?.length ?? 0;
    }

    revalidateAcquire();
    return {
      ok: true,
      dryRun: false,
      inserted: created.length,
      skipped,
      warnings,
      liveMatched,
      summary: formatBulkUploadSummary({
        inserted: created.length,
        skipped,
        liveMatched,
        missingStock,
        bodyOutOfCatalog,
        colorOutOfCatalog,
        duplicatesSkipped: duplicateInFile + duplicateExisting,
      }),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Bulk upload failed",
    };
  }
}

