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
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import { loadTradesBundle } from "@/lib/trades/loadTrades";
import type {
  TradeDeal,
  TradeDealSalesperson,
  TradeRow,
} from "@/lib/trades/types";

export type LoadTradesRangeResult =
  | {
      ok: true;
      preset: DatePreset;
      range: DateRange;
      deals: TradeDeal[];
      trades: TradeRow[];
      dealSalespeople: TradeDealSalesperson[];
    }
  | { ok: false; error: string };

const TRADES_PRESETS = new Set<DatePreset>([
  "mtd",
  "last_month",
  "ytd",
  "all_time",
  "month",
]);

function parsePreset(raw: string): DatePreset | null {
  if (TRADES_PRESETS.has(raw as DatePreset)) return raw as DatePreset;
  return null;
}

export async function loadTradesRange(opts: {
  presetRaw: string;
  year?: number;
  month?: number;
}): Promise<LoadTradesRangeResult> {
  const preset = parsePreset(opts.presetRaw);
  if (!preset) {
    return { ok: false, error: "Invalid date preset." };
  }

  if (preset === "month") {
    const year = opts.year;
    const month = opts.month;
    if (
      year == null ||
      month == null ||
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return { ok: false, error: "Month preset requires year and month." };
    }
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || isStoreViewer(profile.role)) {
    return { ok: false, error: "You do not have access to Trades." };
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) {
    return { ok: false, error: "No auto group selected." };
  }

  const groupInfo = await getDealerGroupPlanInfo(dealerGroupId);
  if (!canAccessProfitCenter(groupInfo?.plan)) {
    return { ok: false, error: "Trades requires the Analyze plan." };
  }

  const stores = await getAccessibleStores(supabase, profile);
  const storeIds = stores.map((s) => s.id);
  const range = resolveDateRange(preset, {
    year: opts.year,
    month: opts.month,
  });

  try {
    const bundle = await loadTradesBundle(supabase, storeIds, range);
    return {
      ok: true,
      preset,
      range,
      deals: bundle.deals,
      trades: bundle.trades,
      dealSalespeople: bundle.dealSalespeople,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load trades.",
    };
  }
}
