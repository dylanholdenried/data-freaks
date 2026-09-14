import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessBuyBox } from "@/lib/plan-access";
import { isStoreViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import {
  ACTIVE_DATE_PRESETS,
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import { loadSaleBooksDeals } from "@/lib/buy-box/loadDeals";
import { modelKey } from "@/lib/buy-box/hrefs";
import PlanNoAccessState from "../../PlanNoAccessState";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import BuyBoxDealsClient from "../BuyBoxDealsClient";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return "mtd";
}

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function BuyBoxDealsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const make = str(searchParams.make);
  const model = str(searchParams.model);

  if (!make || !model) {
    redirect("/app/buy-box");
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

  const entitlements = await getEffectiveEntitlements(supabase, profile);

  if (!canAccessBuyBox(entitlements.acquire_enabled)) {
    return (
      <PlanNoAccessState
        title="Buy-Box"
        description="Sale vs MMR / JD Power Clean Trade scorecards for pre-owned deals are available with the Acquire addon."
        requiredPlan="Acquire"
        viewerRole={profile.role}
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

  const now = new Date();
  const range = resolveDateRange(preset, { now });
  const wantKey = modelKey(make, model);

  if (storeIds.length === 0) {
    return (
      <BuyBoxDealsClient
        stores={stores}
        deals={[]}
        departmentNamesById={{}}
        make={make}
        model={model}
        preset={preset}
        range={range}
        storeId={storeId}
        groupName={entitlements.groupName ?? ""}
      />
    );
  }

  const scopedStoreIds =
    storeId === "all" ? storeIds : storeIds.filter((id) => id === storeId);

  const { data: deptRows } = await supabase
    .from("departments")
    .select("id,name,store_id")
    .in("store_id", storeIds);

  const departments = (deptRows ?? []) as Department[];
  const departmentNamesById: Record<string, string> = {};
  for (const d of departments) {
    departmentNamesById[d.id] = d.name;
  }

  const allDeals = await loadSaleBooksDeals(
    supabase,
    scopedStoreIds,
    range,
    departments
  );
  const deals = allDeals.filter(
    (d) => modelKey(d.vehicle_make ?? "", d.vehicle_model ?? "") === wantKey
  );

  return (
    <BuyBoxDealsClient
      stores={stores}
      deals={deals}
      departmentNamesById={departmentNamesById}
      make={make}
      model={model}
      preset={preset}
      range={range}
      storeId={storeId}
      groupName={entitlements.groupName ?? ""}
    />
  );
}
