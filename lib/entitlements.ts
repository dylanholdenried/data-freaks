import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDealerGroupPlanInfo,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores, type StoreAccessProfile } from "@/lib/store-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizePlan, type PlanTier } from "@/lib/plan-access";

/**
 * Feature entitlements from stores the user can actually access.
 * Prevents a Log-only rooftop from unlocking Analyze because another store in the group pays.
 */
export type EffectiveEntitlements = {
  plan: PlanTier;
  acquire_enabled: boolean;
  groupName: string | null;
};

export async function getEffectiveEntitlements(
  supabase: SupabaseClient,
  profile: StoreAccessProfile | null | undefined
): Promise<EffectiveEntitlements> {
  if (!profile) {
    return { plan: "log", acquire_enabled: false, groupName: null };
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  const groupInfo = await getDealerGroupPlanInfo(dealerGroupId);
  const accessible = await getAccessibleStores(supabase, profile);

  if (accessible.length === 0) {
    return {
      plan: "log",
      acquire_enabled: false,
      groupName: groupInfo?.name ?? null,
    };
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("stores")
    .select("plan, acquire_enabled, is_active")
    .in(
      "id",
      accessible.map((s) => s.id)
    );

  if (error) {
    console.error("getEffectiveEntitlements: stores", error);
    return {
      plan: "log",
      acquire_enabled: false,
      groupName: groupInfo?.name ?? null,
    };
  }

  const active = (data ?? []).filter((s) => s.is_active !== false);
  const plan: PlanTier = active.some((s) => normalizePlan(s.plan) === "analyze")
    ? "analyze"
    : "log";
  const acquire_enabled = active.some((s) => Boolean(s.acquire_enabled));

  return {
    plan,
    acquire_enabled,
    groupName: groupInfo?.name ?? null,
  };
}
