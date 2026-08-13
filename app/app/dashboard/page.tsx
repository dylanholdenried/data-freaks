import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { getCentralTimeParts } from "@/lib/dashboard/pace";
import { isAppViewOnly } from "@/lib/impersonation";
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
  sale_date: string;
  acquisition_source: string | null;
  finance_type: string | null;
};
type Department = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
};
type CalendarDay = { date: string; is_working_day: boolean; store_id: string };
type Goal = { department_id: string; volume_goal: number };

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

export default async function DashboardPage({
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
  const firstOfMonth = `${year}-${mm}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastOfMonth = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const viewOnly = await isAppViewOnly(profile.role);

  const emptyProps = {
    stores: [] as Store[],
    deals: [] as Deal[],
    departments: [] as Department[],
    calendarDays: [] as CalendarDay[],
    goals: [] as Goal[],
    year,
    month,
    isCurrentMonth,
    isFutureMonth,
    currentYear: ct.year,
    currentMonth: ct.month,
    viewOnly,
  };

  if (storeIds.length === 0) {
    return <DashboardClient {...emptyProps} />;
  }

  const [dealsRes, deptsRes, calRes] = await Promise.all([
    fetchAllRows<Deal>((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,status,front_profit,back_profit,store_id,department_id,sale_date,acquisition_source,finance_type"
        )
        .in("store_id", storeIds)
        .gte("sale_date", firstOfMonth)
        .lte("sale_date", lastOfMonth)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("departments")
      .select("id,name,store_id,rolls_up_to_department_id")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("store_calendar_days")
      .select("date,is_working_day,store_id")
      .in("store_id", storeIds)
      .gte("date", firstOfMonth)
      .lte("date", lastOfMonth),
  ]);

  const deals = dealsRes.data;
  const departments = (deptsRes.data ?? []) as unknown as Department[];
  const calendarDays = (calRes.data ?? []) as unknown as CalendarDay[];

  const deptIds = departments.map((d) => d.id);
  let goals: Goal[] = [];

  if (deptIds.length > 0) {
    const { data: goalsData } = await supabase
      .from("department_goals")
      .select("department_id,volume_goal")
      .in("department_id", deptIds)
      .eq("year", year)
      .eq("month", month);
    goals = (goalsData ?? []) as unknown as Goal[];
  }

  return (
    <DashboardClient
      stores={stores}
      deals={deals}
      departments={departments}
      calendarDays={calendarDays}
      goals={goals}
      year={year}
      month={month}
      isCurrentMonth={isCurrentMonth}
      isFutureMonth={isFutureMonth}
      currentYear={ct.year}
      currentMonth={ct.month}
      viewOnly={viewOnly}
    />
  );
}
