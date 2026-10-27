import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessProfitCenter } from "@/lib/plan-access";
import { isStoreViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import {
  ACTIVE_SOLD_VS_STOCK_PRESETS,
  priorRangeFor,
  resolveSoldVsStockRange,
  windowDayCount,
  type SoldVsStockPreset,
} from "@/lib/sold-vs-stock/dateRange";
import {
  loadPreOwnedDepartmentIds,
  loadSoldVsStockDeals,
  loadSoldVsStockInventory,
  loadVehicleCatalog,
} from "@/lib/sold-vs-stock/load";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../PlanNoAccessState";
import SoldVsStockClient from "./SoldVsStockClient";

type Store = { id: string; name: string };

function parsePreset(raw: string | undefined): SoldVsStockPreset {
  if (raw && ACTIVE_SOLD_VS_STOCK_PRESETS.has(raw as SoldVsStockPreset)) {
    return raw as SoldVsStockPreset;
  }
  return "last_30_days";
}

export default async function SoldVsStockPage({
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

  const entitlements = await getEffectiveEntitlements(supabase, profile);

  if (!canAccessProfitCenter(entitlements.plan)) {
    return (
      <PlanNoAccessState
        title="Sold vs Stock"
        description="Rooftop sold-vs-stock stocking signals are available on the Analyze plan."
        requiredPlan="Analyze"
        viewerRole={profile.role}
      />
    );
  }

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const preset = parsePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  );
  const storesParam =
    typeof searchParams.stores === "string" ? searchParams.stores : undefined;
  const requestedStoreIds = storesParam
    ? storesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const initialStoreIds =
    requestedStoreIds.length > 0
      ? requestedStoreIds.filter((id) => storeIds.includes(id))
      : storeIds;
  const range = resolveSoldVsStockRange(preset);
  const priorRange = priorRangeFor(range);
  const windowDays = windowDayCount(range);

  if (storeIds.length === 0) {
    return (
      <SoldVsStockClient
        stores={stores}
        deals={[]}
        priorDeals={[]}
        units={[]}
        groupName={entitlements.groupName ?? ""}
        preset={preset}
        range={range}
        priorRange={priorRange}
        windowDays={windowDays}
        snapshotDate={null}
        initialStoreIds={[]}
      />
    );
  }

  const [preOwnedDeptIds, catalog] = await Promise.all([
    loadPreOwnedDepartmentIds(supabase, storeIds),
    loadVehicleCatalog(supabase),
  ]);

  const [deals, priorDeals, inventory] = await Promise.all([
    loadSoldVsStockDeals(supabase, storeIds, range, preOwnedDeptIds, catalog),
    loadSoldVsStockDeals(
      supabase,
      storeIds,
      priorRange,
      preOwnedDeptIds,
      catalog
    ),
    loadSoldVsStockInventory(supabase, storeIds, catalog),
  ]);

  return (
    <SoldVsStockClient
      stores={stores}
      deals={deals}
      priorDeals={priorDeals}
      units={inventory.units}
      groupName={entitlements.groupName ?? ""}
      preset={preset}
      range={range}
      priorRange={priorRange}
      windowDays={windowDays}
      snapshotDate={inventory.snapshotDate}
      initialStoreIds={
        initialStoreIds.length > 0 ? initialStoreIds : storeIds
      }
    />
  );
}
