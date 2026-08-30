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
import { loadProfitCenterDeals } from "@/lib/profit-center/loadDeals";
import {
  buildTradesByDeal,
  filterDeals,
  type ProfitFilters,
} from "@/lib/profit-center/aggregate";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../../PlanNoAccessState";
import CompareClient, { type CompareType } from "../CompareClient";

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

export default async function ProfitCenterComparePage({
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

  const typeRaw = str(searchParams.type) ?? "model";
  const type: CompareType =
    typeRaw === "acquisition" || typeRaw === "store" ? typeRaw : "model";
  const a = str(searchParams.a) ?? "";
  const b = str(searchParams.b) ?? "";
  const slice = str(searchParams.slice);
  const sliceTypeRaw = str(searchParams.sliceType);
  const sliceType =
    sliceTypeRaw === "acquisition" || sliceTypeRaw === "model"
      ? sliceTypeRaw
      : undefined;

  const preset = parsePreset(str(searchParams.preset));
  const storeParam = str(searchParams.store);
  const storeId =
    storeParam && stores.some((s) => s.id === storeParam) ? storeParam : "all";
  const departmentName = str(searchParams.department) ?? "all";
  const range = resolveDateRange(preset, { now: new Date() });

  if (storeIds.length === 0) {
    return (
      <CompareClient
        type={type}
        a={a}
        b={b}
        slice={slice}
        sliceType={sliceType}
        stores={stores}
        departments={[]}
        deals={[]}
        trades={[]}
        dealSalespeople={[]}
        preset={preset}
        range={range}
        storeId={storeId}
        departmentName={departmentName}
        optionsA={[]}
        optionsB={[]}
      />
    );
  }

  const [bundle, deptRes] = await Promise.all([
    loadProfitCenterDeals(supabase, storeIds, range),
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name", { ascending: true }),
  ]);

  const departments = (deptRes.data ?? []) as Department[];
  const departmentNames = new Map(
    departments.map((d) => [d.id, d.name] as const)
  );
  const tradesByDeal = buildTradesByDeal(bundle.trades);

  const baseFilters: ProfitFilters = {
    storeId: type === "store" ? "all" : storeId,
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

  let optionsA: string[] = [];
  let optionsB: string[] = [];

  if (type === "store") {
    optionsA = stores.map((s) => s.id);
    optionsB = stores.map((s) => s.id);
  } else if (type === "acquisition") {
    optionsA = [
      ...new Set(
        scoped.map((d) => d.acquisition_source?.trim() || "(Unknown)")
      ),
    ].sort();
    optionsB = optionsA;
  } else {
    optionsA = [
      ...new Set(
        scoped.map((d) => `${d.vehicle_make} ${d.vehicle_model}`.trim())
      ),
    ].sort();
    optionsB = optionsA;
  }

  const resolvedA = a && optionsA.includes(a) ? a : optionsA[0] ?? "";
  let resolvedB = b && optionsB.includes(b) ? b : "";
  if (!resolvedB || resolvedB === resolvedA) {
    resolvedB = optionsB.find((o) => o !== resolvedA) ?? optionsB[0] ?? "";
  }

  return (
    <CompareClient
      type={type}
      a={resolvedA}
      b={resolvedB}
      slice={slice}
      sliceType={sliceType}
      stores={stores}
      departments={departments}
      deals={bundle.deals}
      trades={bundle.trades}
      dealSalespeople={bundle.dealSalespeople}
      preset={preset}
      range={range}
      storeId={storeId}
      departmentName={departmentName}
      optionsA={optionsA}
      optionsB={optionsB}
    />
  );
}
