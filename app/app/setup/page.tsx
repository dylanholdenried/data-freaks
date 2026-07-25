import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import SetupClient from "./SetupClient";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

type StoreRow = { id: string; name: string };
type DeptRow = { id: string; name: string; store_id: string };
type PersonRow = { id: string; name: string; store_id: string; active: boolean };
type SourceRow = { id: string; name: string; store_id: string; active: boolean };
type GoalRow = { department_id: string; year: number; month: number; volume_goal: number };

export default async function SetupPage() {
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

  const stores = (await getAccessibleStores(supabase, profile)) as StoreRow[];
  const storeIds = stores.map((s) => s.id);

  const now = new Date();
  const initialYear = now.getUTCFullYear();
  const initialMonth = now.getUTCMonth() + 1;

  if (storeIds.length === 0) {
    return (
      <SetupClient
        stores={[]}
        departments={[]}
        salespeople={[]}
        acquisitionSources={[]}
        financeManagers={[]}
        initialGoals={[]}
        initialYear={initialYear}
        initialMonth={initialMonth}
      />
    );
  }

  // Parallel: departments, salespeople, acquisition sources, finance managers
  const [deptRes, spRes, srcRes, fmRes] = await Promise.all([
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("salespeople")
      .select("id,name,store_id,active")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("acquisition_sources")
      .select("id,name,store_id,active")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("finance_managers")
      .select("id,name,store_id,active")
      .in("store_id", storeIds)
      .order("name"),
  ]);

  const departments = (deptRes.data ?? []) as unknown as DeptRow[];
  const salespeople = (spRes.data ?? []) as unknown as PersonRow[];
  const acquisitionSources = (srcRes.data ?? []) as unknown as SourceRow[];
  const financeManagers = (fmRes.data ?? []) as unknown as PersonRow[];

  // Goals: sequential after departments
  const deptIds = departments.map((d) => d.id);
  let initialGoals: GoalRow[] = [];
  if (deptIds.length > 0) {
    const { data: goalsData } = await supabase
      .from("department_goals")
      .select("department_id,year,month,volume_goal")
      .in("department_id", deptIds)
      .eq("year", initialYear)
      .eq("month", initialMonth);
    initialGoals = (goalsData ?? []) as unknown as GoalRow[];
  }

  return (
    <SetupClient
      stores={stores}
      departments={departments}
      salespeople={salespeople}
      acquisitionSources={acquisitionSources}
      financeManagers={financeManagers}
      initialGoals={initialGoals}
      initialYear={initialYear}
      initialMonth={initialMonth}
    />
  );
}
