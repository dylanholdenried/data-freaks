import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import {
  getCentralTimeParts,
  isFiDepartment,
  type CalendarDay,
} from "@/lib/dashboard/pace";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import CalendarClient from "./CalendarClient";

function parseYm(
  searchParams: Record<string, string | string[] | undefined>
): { year: number; month: number } {
  const ct = getCentralTimeParts();
  const raw =
    typeof searchParams.ym === "string" ? searchParams.ym : null;
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    return { year: ct.year, month: ct.month };
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return { year: ct.year, month: ct.month };
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { year: ct.year, month: ct.month };
  }
  return { year, month };
}

function isBooked(status: string) {
  return status === "pending" || status === "delivered" || status === "closed";
}

export default async function CalendarPage({
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

  const { year, month } = parseYm(searchParams);

  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const lastOfMonth = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const stores = await getAccessibleStores(supabase, profile);
  const storeIds = stores.map((s) => s.id);

  const [calendarRes, deptsRes, dealsRes] = await Promise.all([
    storeIds.length
      ? supabase
          .from("store_calendar_days")
          .select("store_id,date,is_working_day")
          .in("store_id", storeIds)
          .gte("date", firstOfMonth)
          .lte("date", lastOfMonth)
      : Promise.resolve({
          data: [] as {
            store_id: string;
            date: string;
            is_working_day: boolean;
          }[],
        }),
    storeIds.length
      ? supabase
          .from("departments")
          .select("id,name,store_id")
          .in("store_id", storeIds)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({
          data: [] as { id: string; name: string; store_id: string }[],
        }),
    storeIds.length
      ? supabase
          .from("deals")
          .select("store_id,department_id,sale_date,status")
          .in("store_id", storeIds)
          .gte("sale_date", firstOfMonth)
          .lte("sale_date", lastOfMonth)
      : Promise.resolve({
          data: [] as {
            store_id: string;
            department_id: string;
            sale_date: string;
            status: string;
          }[],
        }),
  ]);

  const calendarDays = (calendarRes.data ?? []) as CalendarDay[];
  const departments = (deptsRes.data ?? [])
    .filter((d) => !isFiDepartment(d.name))
    .map((d) => ({ id: d.id, name: d.name, store_id: d.store_id }));

  const deals = (dealsRes.data ?? [])
    .filter((d) => isBooked(d.status))
    .map((d) => ({
      store_id: d.store_id,
      department_id: d.department_id,
      sale_date: d.sale_date,
    }));

  return (
    <CalendarClient
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      departments={departments}
      calendarDays={calendarDays}
      deals={deals}
      year={year}
      month={month}
    />
  );
}
