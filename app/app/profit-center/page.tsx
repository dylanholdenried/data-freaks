import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
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
import {
  DEFAULT_BUY_BOX_SETTINGS,
  settingsFromDbRow,
} from "@/lib/profit-center/buyBox";
import { loadProfitCenterDeals } from "@/lib/profit-center/loadDeals";
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
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user!.id))
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
  const storeParamRaw =
    typeof searchParams.store === "string" ? searchParams.store : undefined;
  const storeId =
    storeParamRaw && stores.some((s) => s.id === storeParamRaw)
      ? storeParamRaw
      : "all";
  const departmentParam =
    typeof searchParams.department === "string"
      ? searchParams.department
      : undefined;

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
      initialStoreId={storeId}
      initialDepartmentName={departmentParam}
    />
  );

  if (storeIds.length === 0) {
    return emptyClient;
  }

  const [bundle, spRes, deptRes, settingsRes] = await Promise.all([
    loadProfitCenterDeals(supabase, storeIds, range),
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

  let buyBoxSettings = settingsFromDbRow(settingsRes.data ?? null);
  if (settingsRes.error) {
    buyBoxSettings = DEFAULT_BUY_BOX_SETTINGS;
  }

  const salespeople = (spRes.data ?? []) as Salesperson[];
  const departments = (deptRes.data ?? []) as Department[];

  return (
    <ProfitCenterClient
      stores={stores}
      departments={departments}
      deals={bundle.deals}
      trades={bundle.trades}
      salespeople={salespeople}
      dealSalespeople={bundle.dealSalespeople}
      buyBoxSettings={buyBoxSettings}
      groupName={groupInfo?.name ?? ""}
      preset={preset}
      range={range}
      initialStoreId={storeId}
      initialDepartmentName={departmentParam}
    />
  );
}
