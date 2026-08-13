import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { getCentralTimeParts } from "@/lib/dashboard/pace";
import { isStoreViewer } from "@/lib/roles";
import { isAppViewOnly } from "@/lib/impersonation";
import { redirect } from "next/navigation";
import SetupClient from "./SetupClient";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

type StoreRow = { id: string; name: string };
type DeptRow = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
};
type PersonRow = { id: string; name: string; store_id: string; active: boolean };
type SourceRow = { id: string; name: string; store_id: string; active: boolean };
type GoalRow = { department_id: string; year: number; month: number; volume_goal: number };

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

export default async function SetupPage({
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
    .select("id, dealer_group_id, role, onboarding_checklist")
    .or(profileMatchAuthUserId(user!.id))
    .maybeSingle();

  if (isStoreViewer(profile?.role)) {
    redirect("/app/dashboard");
  }

  const readOnly = await isAppViewOnly(profile?.role);
  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const stores = (await getAccessibleStores(supabase, profile)) as StoreRow[];
  const storeIds = stores.map((s) => s.id);

  const { year: initialYear, month: initialMonth } = parseYearMonth(searchParams);
  const showOnboardingChecklist = profile.role === "group_admin";
  const onboardingChecklist =
    (profile.onboarding_checklist as {
      salespeople?: boolean;
      finance_managers?: boolean;
      acquisition_sources?: boolean;
      goals?: boolean;
    }) || {};

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
        onboardingChecklist={onboardingChecklist}
        showOnboardingChecklist={showOnboardingChecklist}
        readOnly={readOnly}
      />
    );
  }

  // Parallel: departments, salespeople, acquisition sources, finance managers
  const [deptRes, spRes, srcRes, fmRes] = await Promise.all([
    supabase
      .from("departments")
      .select("id,name,store_id,rolls_up_to_department_id")
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

  // Goals: sequential after departments — for the requested year/month
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
      onboardingChecklist={onboardingChecklist}
      showOnboardingChecklist={showOnboardingChecklist}
      readOnly={readOnly}
    />
  );
}
