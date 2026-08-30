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
  scoreBuyBox,
  settingsFromDbRow,
} from "@/lib/profit-center/buyBox";
import { loadProfitCenterDeals } from "@/lib/profit-center/loadDeals";
import { loadLatestInventoryUnits } from "@/lib/profit-center/loadInventory";
import {
  aggregateByDimension,
  buildTradesByDeal,
  filterDeals,
  type ProfitFilters,
} from "@/lib/profit-center/aggregate";
import {
  cohortTitle,
  dealMatchesCohort,
  splitMakeModel,
  type CohortFocus,
} from "@/lib/profit-center/cohort";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../../PlanNoAccessState";
import CohortClient from "../CohortClient";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

const FOCUSES = new Set<CohortFocus>([
  "model",
  "acquisition",
  "price",
  "odometer",
  "year",
  "trim",
]);

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return "mtd";
}

function parseFocus(raw: string | undefined): CohortFocus {
  if (raw && FOCUSES.has(raw as CohortFocus)) return raw as CohortFocus;
  return "model";
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function ProfitCenterCohortPage({
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

  const focus = parseFocus(str(searchParams.focus));
  const preset = parsePreset(str(searchParams.preset));
  const storeParam = str(searchParams.store);
  const storeId =
    storeParam && stores.some((s) => s.id === storeParam) ? storeParam : "all";
  const departmentName = str(searchParams.department) ?? "all";

  let make = str(searchParams.make);
  let model = str(searchParams.model);
  const value = str(searchParams.value);

  const now = new Date();
  const range = resolveDateRange(preset, { now });

  if (storeIds.length === 0) {
    return (
      <CohortClient
        title={cohortTitle(focus, { make, model, value })}
        focus={focus}
        make={make}
        model={model}
        value={value}
        stores={stores}
        departments={[]}
        cohortDeals={[]}
        trades={[]}
        dealSalespeople={[]}
        buyBoxSettings={DEFAULT_BUY_BOX_SETTINGS}
        scored={null}
        signal={null}
        preset={preset}
        range={range}
        storeId={storeId}
        departmentName={departmentName}
        inventoryUnits={[]}
        inventorySnapshotDate={null}
      />
    );
  }

  const [bundle, deptRes, settingsRes, inventory] = await Promise.all([
    loadProfitCenterDeals(supabase, storeIds, range),
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
    loadLatestInventoryUnits(
      supabase,
      storeId === "all" ? storeIds : [storeId]
    ),
  ]);

  const departments = (deptRes.data ?? []) as Department[];
  const departmentNames = new Map(
    departments.map((d) => [d.id, d.name] as const)
  );
  const buyBoxSettings = settingsRes.error
    ? DEFAULT_BUY_BOX_SETTINGS
    : settingsFromDbRow(settingsRes.data ?? null);

  const tradesByDeal = buildTradesByDeal(bundle.trades);

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

  if (focus === "model" && !make && value) {
    const split = splitMakeModel(value, scoped);
    make = split.make;
    model = split.model;
  }

  const cohortDeals = scoped.filter((d) =>
    dealMatchesCohort(d, focus, { make, model, value })
  );

  // Score within the filtered store/dept cut so buy/red badge matches main page.
  const modelRows = aggregateByDimension("model", {
    deals: scoped,
    tradesByDeal,
    dealSalespeople: bundle.dealSalespeople,
    salespersonNames: new Map(),
    departmentNames,
  }).rows;
  const scoredBox = scoreBuyBox(modelRows, buyBoxSettings);

  let scored = null as (typeof scoredBox.scored)[number] | null;
  let signal: "buy" | "red" | "near" | null = null;

  if (focus === "model" && make && model) {
    const key = `${make} ${model}`.trim().toLowerCase();
    scored = scoredBox.scored.find((r) => r.key === key) ?? null;
    if (scoredBox.buys.some((r) => r.key === key)) signal = "buy";
    else if (scoredBox.reds.some((r) => r.key === key)) signal = "red";
    else if (scoredBox.nearMiss.some((r) => r.key === key)) signal = "near";
  } else if (focus === "acquisition" && value) {
    const acqRows = aggregateByDimension("acquisition", {
      deals: scoped,
      tradesByDeal,
      dealSalespeople: bundle.dealSalespeople,
      salespersonNames: new Map(),
      departmentNames,
    }).rows;
    const acqBox = scoreBuyBox(acqRows, buyBoxSettings);
    const key = value.toLowerCase();
    scored = acqBox.scored.find((r) => r.key === key) ?? null;
    if (acqBox.buys.some((r) => r.key === key)) signal = "buy";
    else if (acqBox.reds.some((r) => r.key === key)) signal = "red";
    else if (acqBox.nearMiss.some((r) => r.key === key)) signal = "near";
  } else if (
    (focus === "price" || focus === "odometer" || focus === "year") &&
    value
  ) {
    const dim =
      focus === "price" ? "price" : focus === "odometer" ? "odometer" : "year";
    const rows = aggregateByDimension(dim, {
      deals: scoped,
      tradesByDeal,
      dealSalespeople: bundle.dealSalespeople,
      salespersonNames: new Map(),
      departmentNames,
    }).rows;
    const box = scoreBuyBox(rows, buyBoxSettings);
    scored =
      box.scored.find((r) => r.key === value || r.label === value) ?? null;
    if (box.buys.some((r) => r.key === value || r.label === value))
      signal = "buy";
    else if (box.reds.some((r) => r.key === value || r.label === value))
      signal = "red";
    else if (box.nearMiss.some((r) => r.key === value || r.label === value))
      signal = "near";
  }

  return (
    <CohortClient
      title={cohortTitle(focus, { make, model, value })}
      focus={focus}
      make={make}
      model={model}
      value={value}
      stores={stores}
      departments={departments}
      cohortDeals={cohortDeals}
      trades={bundle.trades}
      dealSalespeople={bundle.dealSalespeople}
      buyBoxSettings={buyBoxSettings}
      scored={scored}
      signal={signal}
      preset={preset}
      range={range}
      storeId={storeId}
      departmentName={departmentName}
      inventoryUnits={inventory.units}
      inventorySnapshotDate={inventory.snapshotDate}
    />
  );
}
