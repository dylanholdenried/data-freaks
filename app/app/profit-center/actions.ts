"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getDealerGroupPlanInfo,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessProfitCenter } from "@/lib/plan-access";
import { isStoreViewer } from "@/lib/roles";
import {
  ACTIVE_DATE_PRESETS,
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import { loadProfitCenterDeals } from "@/lib/profit-center/loadDeals";
import type { ProfitCenterDealBundle } from "@/lib/profit-center/dealBundle";
import type {
  ProfitDeal,
  ProfitDealSalesperson,
  ProfitTrade,
} from "@/lib/profit-center/aggregate";

export type LoadProfitCenterRangeResult =
  | {
      ok: true;
      preset: DatePreset;
      range: DateRange;
      deals: ProfitDeal[];
      trades: ProfitTrade[];
      dealSalespeople: ProfitDealSalesperson[];
    }
  | { ok: false; error: string };

function parsePreset(raw: string): DatePreset | null {
  if (ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return null;
}

export async function loadProfitCenterRange(
  presetRaw: string
): Promise<LoadProfitCenterRangeResult> {
  const preset = parsePreset(presetRaw);
  if (!preset) {
    return { ok: false, error: "Invalid date preset." };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { ok: false, error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || isStoreViewer(profile.role)) {
    return { ok: false, error: "You do not have access to Profit Center." };
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) {
    return { ok: false, error: "No auto group selected." };
  }

  const groupInfo = await getDealerGroupPlanInfo(dealerGroupId);
  if (!canAccessProfitCenter(groupInfo?.plan)) {
    return { ok: false, error: "Profit Center requires the Analyze plan." };
  }

  const stores = await getAccessibleStores(supabase, profile);
  const storeIds = stores.map((s) => s.id);
  const range = resolveDateRange(preset);

  let bundle: ProfitCenterDealBundle;
  try {
    bundle = await loadProfitCenterDeals(supabase, storeIds, range);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load deals.",
    };
  }

  return {
    ok: true,
    preset,
    range,
    deals: bundle.deals,
    trades: bundle.trades,
    dealSalespeople: bundle.dealSalespeople,
  };
}
