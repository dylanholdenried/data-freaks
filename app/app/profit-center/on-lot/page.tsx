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
import { loadLatestInventoryUnits } from "@/lib/profit-center/loadInventory";
import {
  buildTradesByDeal,
  filterDeals,
  type ProfitFilters,
} from "@/lib/profit-center/aggregate";
import { buildCohortRecommendations } from "@/lib/profit-center/cohortRecommendations";
import {
  filterModelInventoryUnits,
  type SalesProfile,
} from "@/lib/profit-center/inventoryBridge";
import { modelCohortHref } from "@/lib/profit-center/cohort";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../../PlanNoAccessState";
import OnLotClient from "../OnLotClient";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return "mtd";
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function OnLotInventoryPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const make = str(searchParams.make);
  const model = str(searchParams.model);
  if (!make || !model) {
    redirect("/app/profit-center");
  }

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
  const preset = parsePreset(str(searchParams.preset));
  const storeParam = str(searchParams.store);
  const storeId =
    storeParam && stores.some((s) => s.id === storeParam) ? storeParam : "all";
  const departmentName = str(searchParams.department) ?? "all";
  const range = resolveDateRange(preset, { now: new Date() });

  const cohortBackHref = modelCohortHref(make, model, {
    preset,
    storeId,
    departmentName,
  });

  if (storeIds.length === 0) {
    return (
      <OnLotClient
        make={make}
        model={model}
        stores={stores}
        units={[]}
        profile={{
          bestPriceBandKey: null,
          worstPriceBandKey: null,
          bestYearLabel: null,
          worstYearLabel: null,
        }}
        snapshotDate={null}
        preset={preset}
        storeId={storeId}
        departmentName={departmentName}
        range={range}
        cohortBackHref={cohortBackHref}
      />
    );
  }

  const [bundle, settingsRes, inventory] = await Promise.all([
    loadProfitCenterDeals(supabase, storeIds, range),
    supabase
      .from("profit_center_settings")
      .select(
        "min_volume,weight_front,weight_back,weight_turn,weight_trade,list_size"
      )
      .eq("dealer_group_id", dealerGroupId)
      .maybeSingle(),
    loadLatestInventoryUnits(
      supabase,
      storeId === "all" ? storeIds : [storeId]
    ),
  ]);

  const buyBoxSettings = settingsRes.error
    ? DEFAULT_BUY_BOX_SETTINGS
    : settingsFromDbRow(settingsRes.data ?? null);

  const tradesByDeal = buildTradesByDeal(bundle.trades);
  const departmentNames = new Map<string, string>();

  const baseFilters: ProfitFilters = {
    storeId,
    departmentName,
    make: "all",
    model: "all",
    year: "all",
    priceBandId: "all",
    acquisition: "all",
    bodyStyle: "all",
    truckClass: "all",
    salespersonId: "all",
    financeType: "all",
  };

  const scoped = filterDeals(bundle.deals, baseFilters, {
    tradesByDeal,
    dealSalespeople: bundle.dealSalespeople,
    departmentNames,
  });

  const cohortDeals = scoped.filter(
    (d) => d.vehicle_make === make && d.vehicle_model === model
  );

  const recs = buildCohortRecommendations(
    {
      deals: cohortDeals,
      tradesByDeal,
      dealSalespeople: [],
      salespersonNames: new Map(),
      departmentNames,
    },
    buyBoxSettings
  );

  const salesProfile: SalesProfile = {
    bestPriceBandKey: recs.bestPriceBandKey,
    worstPriceBandKey: recs.worstPriceBandKey,
    bestYearLabel: recs.bestYearLabel,
    worstYearLabel: recs.worstYearLabel,
  };

  const units = filterModelInventoryUnits(inventory.units, make, model);

  return (
    <OnLotClient
      make={make}
      model={model}
      stores={stores}
      units={units}
      profile={salesProfile}
      snapshotDate={inventory.snapshotDate}
      preset={preset}
      storeId={storeId}
      departmentName={departmentName}
      range={range}
      cohortBackHref={cohortBackHref}
    />
  );
}
