import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import DashboardClient from "./DashboardClient";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

type Store = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  department_id: string;
};
type Department = { id: string; name: string; store_id: string };
type CalendarDay = { date: string; is_working_day: boolean; store_id: string };
type Goal = { department_id: string; volume_goal: number };
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = { deal_id: string; salesperson_id: string; share_percent: number };

export default async function DashboardPage() {
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

  // Current month bounds (UTC date — close enough for month-level scoping)
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based
  const mm = String(month).padStart(2, "0");
  const firstOfMonth = `${year}-${mm}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  if (storeIds.length === 0) {
    return (
      <DashboardClient
        stores={[]}
        deals={[]}
        departments={[]}
        calendarDays={[]}
        goals={[]}
        salespeople={[]}
        dealSalespeople={[]}
        year={year}
        month={month}
      />
    );
  }

  // Parallel: deals, departments, calendar, salespeople (no active filter — inactive reps'
  // historical deals must still resolve their name)
  const [dealsRes, deptsRes, calRes, spRes] = await Promise.all([
    fetchAllRows<Deal>((from, to) =>
      supabase
        .from("deals")
        .select("id,status,front_profit,back_profit,store_id,department_id")
        .in("store_id", storeIds)
        .gte("sale_date", firstOfMonth)
        .lte("sale_date", lastOfMonth)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("store_calendar_days")
      .select("date,is_working_day,store_id")
      .in("store_id", storeIds)
      .gte("date", firstOfMonth)
      .lte("date", lastOfMonth),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
  ]);

  const deals = dealsRes.data;
  const departments = (deptsRes.data ?? []) as unknown as Department[];
  const calendarDays = (calRes.data ?? []) as unknown as CalendarDay[];
  const salespeople = (spRes.data ?? []) as unknown as Salesperson[];

  // Second parallel: goals (needs deptIds) + deal_salespeople (needs dealIds)
  const deptIds = departments.map((d) => d.id);
  const dealIds = deals.map((d) => d.id);

  let goals: Goal[] = [];
  let dealSalespeople: DealSalesperson[] = [];

  await Promise.all([
    deptIds.length > 0
      ? supabase
          .from("department_goals")
          .select("department_id,volume_goal")
          .in("department_id", deptIds)
          .eq("year", year)
          .eq("month", month)
          .then((res) => {
            goals = (res.data ?? []) as unknown as Goal[];
          })
      : Promise.resolve(),
    fetchAllByIds<DealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    ).then((res) => {
      dealSalespeople = res.data;
    }),
  ]);

  return (
    <DashboardClient
      stores={stores}
      deals={deals}
      departments={departments}
      calendarDays={calendarDays}
      goals={goals}
      salespeople={salespeople}
      dealSalespeople={dealSalespeople}
      year={year}
      month={month}
    />
  );
}
