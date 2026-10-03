"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertStoreAccess } from "@/lib/store-access";
import { assertNotImpersonating } from "@/lib/impersonation";
import { canReopenDeal, isPlatformStaff } from "@/lib/roles";
import {
  classifyStockMatches,
  findStockMatches,
  isUniqueViolation,
} from "@/lib/deals/duplicate-checks";

const LOCKED_STATUSES = new Set(["closed", "dead", "unwound"]);
const REOPEN_TARGETS = new Set(["pending", "delivered"]);

export type ReopenDealResult =
  | { ok: true; status: "pending" | "delivered" }
  | { ok: false; error: string };

export async function reopenDeal(
  dealId: string,
  targetStatus: "pending" | "delivered"
): Promise<ReopenDealResult> {
  if (!dealId || !REOPEN_TARGETS.has(targetStatus)) {
    return { ok: false, error: "Invalid reopen request." };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to reopen a deal." };
  }

  try {
    await assertNotImpersonating();
  } catch {
    return { ok: false, error: "View only access — changes are not allowed while viewing as another user" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || !canReopenDeal(profile.role)) {
    return { ok: false, error: "You do not have permission to reopen deals." };
  }

  const { data: dealData, error: dealError } = await supabase
    .from("deals")
    .select("id, status, store_id, stock_number")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !dealData) {
    return { ok: false, error: "Deal not found." };
  }

  const deal = dealData as {
    id: string;
    status: string;
    store_id: string;
    stock_number: string;
  };

  if (!(await assertStoreAccess(supabase, profile, deal.store_id))) {
    return { ok: false, error: "You do not have access to this store." };
  }

  if (!LOCKED_STATUSES.has(deal.status)) {
    return {
      ok: false,
      error: "Only closed, lost, or unwound deals can be reopened.",
    };
  }

  const matches = await findStockMatches(supabase, {
    storeId: deal.store_id,
    stockNumber: deal.stock_number,
    excludeDealId: deal.id,
  });
  const { blockingMatch } = classifyStockMatches(matches);
  if (blockingMatch) {
    return {
      ok: false,
      error: `Stock #${deal.stock_number} is already used by another active deal (${blockingMatch.status}).`,
    };
  }

  const { error: updateError } = await supabase
    .from("deals")
    .update({ status: targetStatus })
    .eq("id", deal.id)
    .in("status", ["closed", "dead", "unwound"]);

  if (updateError) {
    if (isUniqueViolation(updateError.message)) {
      return {
        ok: false,
        error: `Stock #${deal.stock_number} is already used by another active deal.`,
      };
    }
    return {
      ok: false,
      error: updateError.message || "Failed to reopen deal.",
    };
  }

  revalidatePath(`/app/deals/${deal.id}/edit`);
  revalidatePath("/app/deals");

  return { ok: true, status: targetStatus };
}

export type ListPriceOverrideInput =
  | { dealId: string; mode: "manual"; listPrice: number }
  | { dealId: string; mode: "revert" };

export type ListPriceOverrideResult =
  | {
      ok: true;
      listPrice: number | null;
      listPriceNa: boolean;
      listPriceSource: string | null;
      listPriceAt: string | null;
      saleInvDisp: string | null;
      salePom: number | null;
    }
  | { ok: false; error: string };

/**
 * Platform/owner admin only: set a manual list price on a pre-owned deal, or
 * revert to the inventory-locked value. The deals trigger enforces the same
 * rule server-side for any other writer.
 */
export async function setDealListPriceOverride(
  input: ListPriceOverrideInput
): Promise<ListPriceOverrideResult> {
  if (!input?.dealId) return { ok: false, error: "Invalid request." };
  if (
    input.mode === "manual" &&
    (!Number.isFinite(input.listPrice) || input.listPrice <= 0)
  ) {
    return { ok: false, error: "List price must be a positive number." };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  try {
    await assertNotImpersonating();
  } catch {
    return { ok: false, error: "Changes are not allowed while viewing as another user." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || !isPlatformStaff(profile.role)) {
    return { ok: false, error: "Only platform or owner admins can set list price." };
  }

  const { data: dealData, error: dealError } = await supabase
    .from("deals")
    .select("id, store_id")
    .eq("id", input.dealId)
    .maybeSingle();
  if (dealError || !dealData) return { ok: false, error: "Deal not found." };

  const deal = dealData as { id: string; store_id: string };
  if (!(await assertStoreAccess(supabase, profile, deal.store_id))) {
    return { ok: false, error: "You do not have access to this store." };
  }

  const patch =
    input.mode === "manual"
      ? {
          list_price: Math.round(input.listPrice * 100) / 100,
          list_price_na: false,
          list_price_source: "manual",
        }
      : { list_price_source: null };

  const { data: updated, error: updateError } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", deal.id)
    .select("list_price,list_price_na,list_price_source,list_price_at,sale_inv_disp,sale_pom")
    .maybeSingle();

  if (updateError || !updated) {
    return { ok: false, error: updateError?.message || "Failed to update list price." };
  }

  const row = updated as {
    list_price: number | null;
    list_price_na: boolean;
    list_price_source: string | null;
    list_price_at: string | null;
    sale_inv_disp: string | null;
    sale_pom: number | null;
  };

  revalidatePath(`/app/deals/${deal.id}/edit`);
  revalidatePath("/app/pricing-discipline");

  return {
    ok: true,
    listPrice: row.list_price == null ? null : Number(row.list_price),
    listPriceNa: row.list_price_na,
    listPriceSource: row.list_price_source,
    listPriceAt: row.list_price_at,
    saleInvDisp: row.sale_inv_disp,
    salePom: row.sale_pom == null ? null : Number(row.sale_pom),
  };
}

/** Bust Sales Registry cache after client-side deal mutations. */
export async function revalidateDealsRegistry(): Promise<void> {
  revalidatePath("/app/deals");
}
