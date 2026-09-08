"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { isAppViewOnly } from "@/lib/impersonation";

export type AcqBuyerResult =
  | { ok: true; buyer: { id: string; name: string; active: boolean } }
  | { ok: false; error: string };

export async function createAcquireBuyer(name: string): Promise<AcqBuyerResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Buyer name is required." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile) return { ok: false, error: "Profile not found." };
  if (await isAppViewOnly(profile.role)) {
    return { ok: false, error: "View only — changes are not allowed." };
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) return { ok: false, error: "Select an auto group first." };

  const { data, error } = await supabase
    .from("acq_buyers")
    .insert({
      name: trimmed,
      dealer_group_id: dealerGroupId,
      active: true,
    })
    .select("id,name,active")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add buyer." };
  }

  revalidatePath("/app/setup");
  revalidatePath("/app/acquire/purchases");
  return { ok: true, buyer: data };
}

export async function toggleAcquireBuyer(
  id: string,
  currentlyActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Missing buyer id." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile) return { ok: false, error: "Profile not found." };
  if (await isAppViewOnly(profile.role)) {
    return { ok: false, error: "View only — changes are not allowed." };
  }

  const { error } = await supabase
    .from("acq_buyers")
    .update({ active: !currentlyActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/setup");
  revalidatePath("/app/acquire/purchases");
  return { ok: true };
}
