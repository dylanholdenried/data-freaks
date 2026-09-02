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
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import { loadTradesBundle } from "@/lib/trades/loadTrades";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../PlanNoAccessState";
import TradesClient from "./TradesClient";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };
type Salesperson = { id: string; name: string; store_id: string };

const TRADES_PRESETS = new Set<string>([
  "mtd",
  "last_month",
  "ytd",
  "all_time",
  "month",
]);

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && TRADES_PRESETS.has(raw)) return raw as DatePreset;
  return "mtd";
}

function parseIntParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default async function TradesPage({
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
        title="Trades"
        description="Trade-in volume, attach rate, ACV/allowance, and hold analytics are available on the Analyze plan and above."
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

  const now = new Date();
  const yearParam = parseIntParam(
    typeof searchParams.year === "string" ? searchParams.year : undefined
  );
  const monthParam = parseIntParam(
    typeof searchParams.month === "string" ? searchParams.month : undefined
  );
  const year = yearParam ?? now.getFullYear();
  const month = monthParam ?? now.getMonth() + 1;

  const range = resolveDateRange(preset, {
    now,
    year: preset === "month" ? year : undefined,
    month: preset === "month" ? month : undefined,
  });

  const emptyClient = (
    <TradesClient
      stores={stores}
      departments={[]}
      salespeople={[]}
      deals={[]}
      trades={[]}
      dealSalespeople={[]}
      groupName={groupInfo?.name ?? ""}
      preset={preset}
      range={range}
      initialStoreId={storeId}
      initialYear={year}
      initialMonth={month}
    />
  );

  if (storeIds.length === 0) {
    return emptyClient;
  }

  const [bundle, deptRes, spRes] = await Promise.all([
    loadTradesBundle(supabase, storeIds, range),
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name", { ascending: true }),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name", { ascending: true }),
  ]);

  const departments = (deptRes.data ?? []) as Department[];
  const salespeople = (spRes.data ?? []) as Salesperson[];

  return (
    <TradesClient
      stores={stores}
      departments={departments}
      salespeople={salespeople}
      deals={bundle.deals}
      trades={bundle.trades}
      dealSalespeople={bundle.dealSalespeople}
      groupName={groupInfo?.name ?? ""}
      preset={preset}
      range={range}
      initialStoreId={storeId}
      initialYear={year}
      initialMonth={month}
    />
  );
}
