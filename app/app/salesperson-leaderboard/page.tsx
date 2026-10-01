import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import {
  getCentralTimeParts,
  type CalendarDay,
} from "@/lib/dashboard/pace";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import LeaderboardClient from "./LeaderboardClient";

type Store = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  store_id: string;
  sale_date: string;
};
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};
type DealWithSplits = Deal & {
  deal_salespeople: Omit<DealSalesperson, "deal_id">[] | null;
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
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user!.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const ct = getCentralTimeParts();
  const { year, month } = parseYearMonth(searchParams);
  const isCurrentMonth = year === ct.year && month === ct.month;
  const isFutureMonth =
    year > ct.year || (year === ct.year && month > ct.month);

  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstOfMonth = `${year}-${mm}-01`;
  const lastOfMonth = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const firstOfYear = `${year}-01-01`;

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const emptyProps = {
    stores: [] as Store[],
    deals: [] as Deal[],
    salespeople: [] as Salesperson[],
    dealSalespeople: [] as DealSalesperson[],
    calendarDays: [] as CalendarDay[],
    year,
    month,
    isCurrentMonth,
    isFutureMonth,
    currentYear: ct.year,
    currentMonth: ct.month,
  };

  if (storeIds.length === 0) {
    return <LeaderboardClient {...emptyProps} />;
  }

  // deal_salespeople is embedded so this page (auto-refreshed every minute)
  // doesn't fan out into chunked `.in("deal_id")` requests.
  const [dealsRes, spRes, calRes] = await Promise.all([
    fetchAllRows<DealWithSplits>((from, to) =>
      supabase
        .from("deals")
        .select("id,status,store_id,sale_date,deal_salespeople(salesperson_id,share_percent)")
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
    supabase
      .from("store_calendar_days")
      .select("date,is_working_day,store_id")
      .in("store_id", storeIds)
      .gte("date", firstOfMonth)
      .lte("date", lastOfMonth),
  ]);

  const dealSalespeople: DealSalesperson[] = [];
  const deals: Deal[] = dealsRes.data.map(({ deal_salespeople, ...deal }) => {
    for (const s of deal_salespeople ?? []) {
      dealSalespeople.push({
        deal_id: deal.id,
        salesperson_id: s.salesperson_id,
        share_percent: s.share_percent,
      });
    }
    return deal;
  });
  const salespeople = (spRes.data ?? []) as unknown as Salesperson[];
  const calendarDays = (calRes.data ?? []) as unknown as CalendarDay[];

  return (
    <LeaderboardClient
      stores={stores}
      deals={deals}
      salespeople={salespeople}
      dealSalespeople={dealSalespeople}
      calendarDays={calendarDays}
      year={year}
      month={month}
      isCurrentMonth={isCurrentMonth}
      isFutureMonth={isFutureMonth}
      currentYear={ct.year}
      currentMonth={ct.month}
    />
  );
}
