"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertStoreAccess } from "@/lib/store-access";
import { assertNotImpersonating } from "@/lib/impersonation";
import { canReopenDeal } from "@/lib/roles";
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
