import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  getDealerGroupPlanInfo,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessProfitCenter } from "@/lib/plan-access";
import { isStoreViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import {
  ACTIVE_DATE_PRESETS,
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import type {
  ProfitDeal,
  ProfitDealSalesperson,
  ProfitTrade,
} from "@/lib/profit-center/aggregate";
import {
  DEFAULT_BUY_BOX_SETTINGS,
  settingsFromDbRow,
} from "@/lib/profit-center/buyBox";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../PlanNoAccessState";
import ProfitCenterClient from "./ProfitCenterClient";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };
type Department = { id: string; name: string; store_id: string };

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return "mtd";
}

export default async function ProfitCenterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  if (isStoreViewer(profile?.role)) {
    redirect("/app/dashboard");
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const groupInfo = await getDealerGroupPlanInfo(dealerGroupId);

  if (!canAccessProfitCenter(groupInfo?.plan)) {
    return (
      <PlanNoAccessState
        title="Profit Center"
        description="Gross and turn analytics by make, model, price band, acquisition source, and salesperson leaderboards are available on the Analyze plan and above."
        requiredPlan="Analyze"
      />
    );
  }

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const preset = parsePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  );

  const now = new Date();
  const range = resolveDateRange(preset, { now });

  const emptyClient = (
    <ProfitCenterClient
      stores={stores}
      departments={[]}
      deals={[]}
      trades={[]}
      salespeople={[]}
      dealSalespeople={[]}
      buyBoxSettings={DEFAULT_BUY_BOX_SETTINGS}
      groupName={groupInfo?.name ?? ""}
      preset={preset}
      range={range}
    />
  );

  if (storeIds.length === 0) {
    return emptyClient;
  }

  const [dealsRes, spRes, deptRes, settingsRes] = await Promise.all([
    fetchAllRows<ProfitDeal>((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,sale_date,store_id,department_id,vehicle_year,vehicle_make,vehicle_model,body_style," +
            "acquisition_source,finance_type,front_profit,back_profit,sale_price," +
            "list_price,list_price_na,age"
        )
        .in("store_id", storeIds)
        .eq("status", "closed")
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds),
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name", { ascending: true }),
    supabase
      .from("profit_center_settings")
      .select(
        "min_volume,weight_front,weight_back,weight_turn,weight_trade,list_size"
      )
      .eq("dealer_group_id", dealerGroupId)
      .maybeSingle(),
  ]);

  let deals = dealsRes.data;
  let buyBoxSettings = settingsFromDbRow(settingsRes.data ?? null);

  // Settings table may not exist until migration is applied
  if (settingsRes.error) {
    buyBoxSettings = DEFAULT_BUY_BOX_SETTINGS;
  }

  // Fallback if list_price columns missing
  if (dealsRes.error?.message?.includes("list_price")) {
    const fallback = await fetchAllRows<
      Omit<ProfitDeal, "list_price" | "list_price_na">
    >((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,sale_date,store_id,department_id,vehicle_year,vehicle_make,vehicle_model,body_style," +
            "acquisition_source,finance_type,front_profit,back_profit,sale_price,age"
        )
        .in("store_id", storeIds)
        .eq("status", "closed")
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true })
        .range(from, to)
    );
    deals = fallback.data.map((d) => ({
      ...d,
      list_price: null,
      list_price_na: true,
    }));
  } else if (dealsRes.error) {
    throw new Error(dealsRes.error.message);
  }

  for (const d of deals) {
    if (typeof d.list_price_na !== "boolean") {
      (d as { list_price_na: boolean }).list_price_na = false;
    }
    if (d.department_id === undefined) {
      (d as { department_id: string | null }).department_id = null;
    }
  }

  const dealIds = deals.map((d) => d.id);
  const [tradesRes, dspRes] = await Promise.all([
    fetchAllByIds<ProfitTrade>(dealIds, (idChunk, from, to) =>
      supabase
        .from("trades")
        .select("deal_id,acv,allowance")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
    fetchAllByIds<ProfitDealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
  ]);

  const salespeople = (spRes.data ?? []) as Salesperson[];
  const departments = (deptRes.data ?? []) as Department[];

  return (
    <ProfitCenterClient
      stores={stores}
      departments={departments}
      deals={deals}
      trades={tradesRes.data}
      salespeople={salespeople}
      dealSalespeople={dspRes.data}
      buyBoxSettings={buyBoxSettings}
      groupName={groupInfo?.name ?? ""}
      preset={preset}
      range={range}
    />
  );
}
