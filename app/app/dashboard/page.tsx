import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import DashboardClient from "./DashboardClient";

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

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  if (!profile?.dealer_group_id) {
    redirect("/app/deals");
  }

  // Current month bounds (UTC date — close enough for month-level scoping)
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based
  const mm = String(month).padStart(2, "0");
  const firstOfMonth = `${year}-${mm}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: storesData } = await supabase
    .from("stores")
    .select("id,name")
    .eq("dealer_group_id", profile.dealer_group_id)
    .order("name");

  const stores = (storesData ?? []) as unknown as Store[];
  const storeIds = stores.map((s) => s.id);

  if (storeIds.length === 0) {
    return (
      <DashboardClient
        stores={[]}
        deals={[]}
        departments={[]}
        calendarDays={[]}
        goals={[]}
        year={year}
        month={month}
      />
    );
  }

  // Parallel: deals, departments, calendar exceptions — all scoped to this month + user's stores
  const [dealsRes, deptsRes, calRes] = await Promise.all([
    supabase
      .from("deals")
      .select("id,status,front_profit,back_profit,store_id,department_id")
      .in("store_id", storeIds)
      .gte("sale_date", firstOfMonth)
      .lte("sale_date", lastOfMonth),
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
  ]);

  const deals = (dealsRes.data ?? []) as unknown as Deal[];
  const departments = (deptsRes.data ?? []) as unknown as Department[];
  const calendarDays = (calRes.data ?? []) as unknown as CalendarDay[];

  // Goals require department IDs — sequential after departments fetch
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
    />
  );
}
