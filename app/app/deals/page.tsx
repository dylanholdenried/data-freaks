import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import DealsClient from "./DealsClient";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

type Deal = {
  id: string;
  sale_date: string;
  status: string;
  customer_last_name: string;
  stock_number: string;
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

export default async function DealsPage() {
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
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Sales Registry
          </h1>
        </section>
        <div className="app-panel p-8 text-center">
          <p className="text-sm text-slate-500">
            No stores configured. Go to{" "}
            <Link href="/app/setup" className="text-blue-600 underline">
              Setup &amp; Config
            </Link>{" "}
            to add your first store.
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const initialYear = now.getUTCFullYear();
  const initialMonth = now.getUTCMonth() + 1;

  // Parallel: ALL deals (no status/date filter) + departments + salespeople + finance managers
  // Salespeople: no active filter — inactive reps' historical deals must resolve their name
  const [dealsRes, deptRes, spRes, fmRes] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id,sale_date,status,customer_last_name,stock_number," +
          "vehicle_year,vehicle_make,vehicle_model," +
          "store_id,department_id," +
          "front_profit,back_profit,finance_type,finance_manager_id"
      )
      .in("store_id", storeIds)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false }),
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

  const deals = (dealsRes.data ?? []) as unknown as Deal[];
  const departments = (deptRes.data ?? []) as unknown as DeptRow[];
  const salespeople = (spRes.data ?? []) as unknown as PersonRow[];
  const financeManagers = (fmRes.data ?? []) as unknown as PersonRow[];

  // Sequential: deal_salespeople needs deal IDs
  const dealIds = deals.map((d) => d.id);
  let dealSalespeople: DealSalesperson[] = [];
  if (dealIds.length > 0) {
    const { data } = await supabase
      .from("deal_salespeople")
      .select("deal_id,salesperson_id")
      .in("deal_id", dealIds);
    dealSalespeople = (data ?? []) as unknown as DealSalesperson[];
  }

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
    />
  );
}
