import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  getDealerGroupPlan,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessProfitCenter } from "@/lib/plan-access";
import { getCentralTimeParts } from "@/lib/dashboard/pace";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../PlanNoAccessState";
import LeaderboardClient from "./LeaderboardClient";

type Store = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  sale_date: string;
};
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

function parseYearMonth(
  searchParams: Record<string, string | string[] | undefined>
): { year: number; month: number } {
  const ct = getCentralTimeParts();
  const rawYear = typeof searchParams.year === "string" ? searchParams.year : null;
  const rawMonth = typeof searchParams.month === "string" ? searchParams.month : null;
  let year = rawYear ? parseInt(rawYear, 10) : ct.year;
  let month = rawMonth ? parseInt(rawMonth, 10) : ct.month;
  if (!Number.isFinite(year) || year < 2020 || year > 2100) year = ct.year;
  if (!Number.isFinite(month) || month < 1 || month > 12) month = ct.month;
  return { year, month };
}

export default async function SalespersonLeaderboardPage({
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

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const groupPlan = await getDealerGroupPlan(dealerGroupId);

  if (!canAccessProfitCenter(groupPlan)) {
    return (
      <PlanNoAccessState
        title="Salesperson Leaderboard"
        description="MTD and YTD salesperson rankings with units and gross are available on the Analyze plan and above."
        requiredPlan="Analyze"
      />
    );
  }

  const ct = getCentralTimeParts();
  const { year, month } = parseYearMonth(searchParams);
  const isCurrentMonth = year === ct.year && month === ct.month;

  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastOfMonth = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const firstOfYear = `${year}-01-01`;

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const emptyProps = {
    stores: [] as Store[],
    deals: [] as Deal[],
    salespeople: [] as Salesperson[],
    dealSalespeople: [] as DealSalesperson[],
    year,
    month,
    isCurrentMonth,
    currentYear: ct.year,
    currentMonth: ct.month,
  };

  if (storeIds.length === 0) {
    return <LeaderboardClient {...emptyProps} />;
  }

  const [dealsRes, spRes] = await Promise.all([
    fetchAllRows<Deal>((from, to) =>
      supabase
        .from("deals")
        .select("id,status,front_profit,back_profit,store_id,sale_date")
        .in("store_id", storeIds)
        .gte("sale_date", firstOfYear)
        .lte("sale_date", lastOfMonth)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
  ]);

  const deals = dealsRes.data;
  const salespeople = (spRes.data ?? []) as unknown as Salesperson[];
  const dealIds = deals.map((d) => d.id);

  let dealSalespeople: DealSalesperson[] = [];
  if (dealIds.length > 0) {
    const res = await fetchAllByIds<DealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    );
    dealSalespeople = res.data;
  }

  return (
    <LeaderboardClient
      stores={stores}
      deals={deals}
      salespeople={salespeople}
      dealSalespeople={dealSalespeople}
      year={year}
      month={month}
      isCurrentMonth={isCurrentMonth}
      currentYear={ct.year}
      currentMonth={ct.month}
    />
  );
}
