import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ClipboardList } from "lucide-react";

type Deal = {
  id: string;
  sale_date: string;
  created_at: string;
  customer_last_name: string;
  stock_number: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  store_id: string;
  department_id: string;
};

type Store = { id: string; name: string };
type Department = { id: string; name: string };
type Salesperson = { id: string; name: string };
type Assignment = { deal_id: string; salesperson_id: string };

function formatDate(dateStr: string) {
  // Parse as local date (YYYY-MM-DD) to avoid UTC offset shifting the display day
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default async function DealsPage() {
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
    redirect("/app/dashboard");
  }

  // 1. User's stores
  const { data: storesData } = await supabase
    .from("stores")
    .select("id,name")
    .eq("dealer_group_id", profile.dealer_group_id)
    .order("name");

  const stores = (storesData ?? []) as Store[];
  const storeIds = stores.map((s) => s.id);
  const storeById = new Map(stores.map((s) => [s.id, s.name]));

  if (storeIds.length === 0) {
    return <EmptyGroupState />;
  }

  // 2. Pending deals + departments + salespeople in parallel
  const [dealsResult, deptResult, spResult] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id,sale_date,created_at,customer_last_name,stock_number,vehicle_year,vehicle_make,vehicle_model,store_id,department_id"
      )
      .in("store_id", storeIds)
      .eq("status", "pending")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id,name").in("store_id", storeIds),
    supabase.from("salespeople").select("id,name").in("store_id", storeIds),
  ]);

  const deals = (dealsResult.data ?? []) as Deal[];
  const deptById = new Map(
    ((deptResult.data ?? []) as Department[]).map((d) => [d.id, d.name])
  );
  const spById = new Map(
    ((spResult.data ?? []) as Salesperson[]).map((sp) => [sp.id, sp.name])
  );

  // 3. Salesperson assignments for these deals (sequential — needs deal IDs)
  const dealIds = deals.map((d) => d.id);
  let assignmentsByDeal = new Map<string, string[]>();

  if (dealIds.length > 0) {
    const { data: assignments } = await supabase
      .from("deal_salespeople")
      .select("deal_id,salesperson_id")
      .in("deal_id", dealIds);

    for (const a of (assignments ?? []) as Assignment[]) {
      const name = spById.get(a.salesperson_id) ?? "Unknown";
      const existing = assignmentsByDeal.get(a.deal_id) ?? [];
      assignmentsByDeal.set(a.deal_id, [...existing, name]);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-kicker">Sales Registry</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Pending Deals
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {deals.length === 0
                ? "No pending deals — use Log Transaction to add one."
                : `${deals.length} pending deal${deals.length === 1 ? "" : "s"} · click any row to update economics.`}
            </p>
          </div>
          <Button asChild>
            <Link href="/app/deals/new" prefetch>
              + New Deal
            </Link>
          </Button>
        </div>
      </section>

      {/* Deal list */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">
            Pending
            {deals.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {deals.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deals.length === 0 ? (
            <EmptyDealsState />
          ) : (
            <div>
              {/* Column header — hidden on mobile */}
              <div className="hidden border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-2 sm:grid sm:grid-cols-[90px_140px_1fr_160px_120px_80px_32px] sm:items-center sm:gap-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Stock #
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Customer
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Vehicle
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Department
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Salesperson
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Date
                </span>
                <span />
              </div>

              {/* Rows — each is a full-width Link */}
              <div className="divide-y divide-[#edf1f7]">
                {deals.map((deal) => {
                  const spNames = assignmentsByDeal.get(deal.id) ?? [];
                  return (
                    <Link
                      key={deal.id}
                      href={`/app/deals/${deal.id}/edit`}
                      prefetch
                      className="group flex flex-col gap-1 px-5 py-3 transition-colors hover:bg-[#f5f8ff] sm:grid sm:grid-cols-[90px_140px_1fr_160px_120px_80px_32px] sm:items-center sm:gap-4"
                    >
                      {/* Stock # */}
                      <span className="font-mono text-sm font-semibold text-blue-700">
                        {deal.stock_number}
                      </span>

                      {/* Customer */}
                      <span className="text-sm font-medium text-slate-800">
                        {deal.customer_last_name}
                      </span>

                      {/* Vehicle */}
                      <span className="text-sm text-slate-600">
                        {deal.vehicle_year} {deal.vehicle_make} {deal.vehicle_model}
                      </span>

                      {/* Department — stacked label on mobile */}
                      <span className="text-sm text-slate-500">
                        <span className="mr-1 text-xs text-slate-400 sm:hidden">Dept:</span>
                        {deptById.get(deal.department_id) ?? "—"}
                      </span>

                      {/* Salesperson */}
                      <span className="text-sm text-slate-500">
                        <span className="mr-1 text-xs text-slate-400 sm:hidden">SP:</span>
                        {spNames.length === 0 ? "—" : spNames.join(", ")}
                      </span>

                      {/* Date */}
                      <span className="text-sm text-slate-400">
                        {formatDate(deal.sale_date)}
                      </span>

                      {/* Chevron */}
                      <ChevronRight className="hidden h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-400 sm:block" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyDealsState() {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <ClipboardList className="h-8 w-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">No pending deals</p>
      <p className="text-xs text-slate-400">
        Deals entered via Log Transaction will appear here.
      </p>
      <Button asChild size="sm" className="mt-1">
        <Link href="/app/deals/new">+ Log Transaction</Link>
      </Button>
    </div>
  );
}

function EmptyGroupState() {
  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Sales Registry</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Pending Deals
        </h1>
      </section>
      <div className="app-panel p-8 text-center">
        <p className="text-sm text-slate-500">
          No stores configured. Go to{" "}
          <Link href="/app/setup" className="text-blue-600 underline">
            Setup & Config
          </Link>{" "}
          to add your first store.
        </p>
      </div>
    </div>
  );
}
