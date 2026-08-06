import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { isStoreViewer } from "@/lib/roles";
import DealsClient from "./DealsClient";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

type Deal = {
  id: string;
  sale_date: string;
  status: string;
  customer_last_name: string | null;
  stock_number: string | null;
  vin: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  store_id: string;
  department_id: string;
  front_profit: number | null;
  back_profit: number | null;
  finance_type: string | null;
  finance_manager_id: string | null;
};

type Store = { id: string; name: string };
type DeptRow = { id: string; name: string; store_id: string };
type PersonRow = { id: string; name: string; store_id: string };
type DealSalesperson = { deal_id: string; salesperson_id: string };

type StatusFilter = "all" | "pending" | "delivered" | "closed" | "dead" | "unwound";

const VALID_STATUS: ReadonlySet<string> = new Set([
  "all",
  "pending",
  "delivered",
  "closed",
  "dead",
  "unwound",
]);

function paramString(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const raw = searchParams[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export default async function DealsPage({
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

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  if (storeIds.length === 0) {
    return (
      <div className="space-y-6">
        <section className="app-panel p-5">
          <p className="app-kicker">Sales Registry</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            Sales Registry
          </h1>
        </section>
        <div className="app-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isStoreViewer(profile.role)
              ? "No stores are assigned to your account. Contact a platform admin if you need access."
              : (
                <>
                  No stores configured. Go to{" "}
                  <Link href="/app/setup" className="text-blue-600 underline">
                    Setup &amp; Config
                  </Link>{" "}
                  to add your first store.
                </>
              )}
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const defaultYear = now.getUTCFullYear();
  const defaultMonth = now.getUTCMonth() + 1;

  const statusParam = paramString(searchParams, "status");
  const storeParam = paramString(searchParams, "store");
  const departmentParam = paramString(searchParams, "department");
  const yearParam = paramString(searchParams, "year");
  const monthParam = paramString(searchParams, "month");

  let initialYear = defaultYear;
  let initialMonth = defaultMonth;
  if (yearParam) {
    const y = parseInt(yearParam, 10);
    if (Number.isFinite(y) && y >= 2020 && y <= 2100) initialYear = y;
  }
  if (monthParam) {
    const m = parseInt(monthParam, 10);
    if (Number.isFinite(m) && m >= 1 && m <= 12) initialMonth = m;
  }

  const initialStatus: StatusFilter =
    statusParam && VALID_STATUS.has(statusParam)
      ? (statusParam as StatusFilter)
      : "all";

  const initialStore =
    storeParam && storeIds.includes(storeParam)
      ? storeParam
      : stores.length === 1
        ? stores[0].id
        : "both";

  // Parallel: ALL deals (paged past PostgREST 1000-row cap) + roster tables
  // Salespeople: no active filter — inactive reps' historical deals must resolve their name
  const [dealsRes, deptRes, spRes, fmRes] = await Promise.all([
    fetchAllRows<Deal>((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,sale_date,status,customer_last_name,stock_number,vin," +
            "vehicle_year,vehicle_make,vehicle_model," +
            "store_id,department_id," +
            "front_profit,back_profit,finance_type,finance_manager_id"
        )
        .in("store_id", storeIds)
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    supabase
      .from("departments")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
    supabase
      .from("finance_managers")
      .select("id,name,store_id")
      .in("store_id", storeIds)
      .order("name"),
  ]);

  const deals = dealsRes.data as Deal[];
  const departments = (deptRes.data ?? []) as unknown as DeptRow[];
  const salespeople = (spRes.data ?? []) as unknown as PersonRow[];
  const financeManagers = (fmRes.data ?? []) as unknown as PersonRow[];

  const initialDepartment =
    departmentParam &&
    departments.some(
      (d) =>
        d.id === departmentParam &&
        (initialStore === "both" || d.store_id === initialStore)
    )
      ? departmentParam
      : "";

  // deal_salespeople: chunk IDs + page each chunk past the 1000-row cap
  const dealIds = deals.map((d) => d.id);
  const { data: dealSalespeople } = await fetchAllByIds<DealSalesperson>(
    dealIds,
    (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id")
        .in("deal_id", idChunk)
        .range(from, to)
  );

  return (
    <DealsClient
      stores={stores}
      deals={deals}
      departments={departments}
      salespeople={salespeople}
      financeManagers={financeManagers}
      dealSalespeople={dealSalespeople}
      initialYear={initialYear}
      initialMonth={initialMonth}
      initialStatus={initialStatus}
      initialStore={initialStore}
      initialDepartment={initialDepartment}
      viewOnly={isStoreViewer(profile.role)}
    />
  );
}
