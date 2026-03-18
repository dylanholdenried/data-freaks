import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Deal = {
  id: string;
  stock_number: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  department_id: string;
  status: "pending" | "delivered" | "closed" | "dead" | "unwound";
  sale_date: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  is_demo: boolean;
};

type Department = {
  id: string;
  name: string;
  store_id: string;
  is_demo: boolean;
};

type Salesperson = {
  id: string;
  name: string;
  store_id: string;
  is_demo: boolean;
};

type DealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number | null;
};

type CalendarDay = {
  id: string;
  store_id: string;
  date: string;
  is_working_day: boolean;
  is_demo: boolean;
};

type DepartmentStat = {
  id: string;
  name: string;
  booked: number;
  closed: number;
  frontGross: number;
  backGross: number;
  totalGross: number;
  avgTotalPerDeal: number;
};

type SalespersonStat = {
  name: string;
  units: number;
  frontGross: number;
  backGross: number;
  totalGross: number;
};

export default async function DemoPage() {
  const supabase = createSupabaseServiceClient();
  const storeId = "22222222-2222-2222-2222-222222222222";

  const [
    { data: deals },
    { data: departments },
    { data: salespeople },
    { data: dealSalespeople },
    { data: calendarDays },
  ] = await Promise.all([
    supabase.from("deals").select("*").eq("is_demo", true).eq("store_id", storeId),
    supabase.from("departments").select("*").eq("is_demo", true).eq("store_id", storeId),
    supabase.from("salespeople").select("*").eq("is_demo", true).eq("store_id", storeId),
    supabase.from("deal_salespeople").select("*"),
    supabase.from("store_calendar_days").select("*").eq("is_demo", true).eq("store_id", storeId),
  ]);

  const dealRows = (deals ?? []) as Deal[];
  const departmentRows = (departments ?? []) as Department[];
  const salespersonRows = (salespeople ?? []) as Salesperson[];
  const dealSalespersonRows = (dealSalespeople ?? []) as DealSalesperson[];
  const calendarRows = (calendarDays ?? []) as CalendarDay[];

  const departmentNameById = new Map(departmentRows.map((d) => [d.id, d.name] as const));

  const bookedDeals = dealRows.filter(
    (deal) => deal.status !== "dead" && deal.status !== "unwound"
  );

  const closedDeals = dealRows.filter(
    (deal) => deal.status === "closed" || deal.status === "delivered"
  );

  const bookedVolume = bookedDeals.length;
  const closedVolume = closedDeals.length;

  const frontGross = closedDeals.reduce((sum, deal) => sum + (deal.front_profit ?? 0), 0);
  const backGross = closedDeals.reduce((sum, deal) => sum + (deal.back_profit ?? 0), 0);
  const closedGross = frontGross + backGross;

  const avgFrontGross = closedVolume ? frontGross / closedVolume : 0;
  const avgBackGross = closedVolume ? backGross / closedVolume : 0;

  const now = new Date();

  const workingDays = calendarRows.filter((day) => day.is_working_day);
  const workingDaysCompleted = workingDays.filter(
    (day) => new Date(day.date) <= now
  ).length;
  const totalWorkingDays = workingDays.length;

  const bookedPace =
    workingDaysCompleted > 0 ? (bookedVolume / workingDaysCompleted) * totalWorkingDays : 0;

  const closedGrossPace =
    workingDaysCompleted > 0 ? (closedGross / workingDaysCompleted) * totalWorkingDays : 0;

  const departmentStats: DepartmentStat[] = departmentRows
    .map((department) => {
      const departmentBookedDeals = bookedDeals.filter((deal) => deal.department_id === department.id);
      const departmentClosedDeals = closedDeals.filter((deal) => deal.department_id === department.id);

      const departmentFrontGross = departmentClosedDeals.reduce(
        (sum, deal) => sum + (deal.front_profit ?? 0),
        0
      );
      const departmentBackGross = departmentClosedDeals.reduce(
        (sum, deal) => sum + (deal.back_profit ?? 0),
        0
      );
      const departmentTotalGross = departmentFrontGross + departmentBackGross;

      return {
        id: department.id,
        name: department.name,
        booked: departmentBookedDeals.length,
        closed: departmentClosedDeals.length,
        frontGross: departmentFrontGross,
        backGross: departmentBackGross,
        totalGross: departmentTotalGross,
        avgTotalPerDeal:
          departmentClosedDeals.length > 0
            ? departmentTotalGross / departmentClosedDeals.length
            : 0,
      };
    })
    .sort((a, b) => b.totalGross - a.totalGross);

  const dealMap = new Map(closedDeals.map((deal) => [deal.id, deal] as const));

  const salespersonStats: SalespersonStat[] = salespersonRows
    .map((salesperson) => {
      const assignments = dealSalespersonRows.filter(
        (assignment) => assignment.salesperson_id === salesperson.id
      );

      let units = 0;
      let salespersonFrontGross = 0;
      let salespersonBackGross = 0;

      for (const assignment of assignments) {
        const deal = dealMap.get(assignment.deal_id);
        if (!deal) continue;

        const share = (assignment.share_percent ?? 100) / 100;

        units += share;
        salespersonFrontGross += (deal.front_profit ?? 0) * share;
        salespersonBackGross += (deal.back_profit ?? 0) * share;
      }

      return {
        name: salesperson.name,
        units,
        frontGross: salespersonFrontGross,
        backGross: salespersonBackGross,
        totalGross: salespersonFrontGross + salespersonBackGross,
      };
    })
    .sort((a, b) => b.units - a.units);

  const recentDeals = [...dealRows]
    .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
    .slice(0, 10);

  const topDepartment = departmentStats[0];
  const lowestFrontDepartment = [...departmentStats].sort((a, b) => a.frontGross - b.frontGross)[0];
  const topSalesperson = salespersonStats[0];

  const insights = [
    topDepartment
      ? `${topDepartment.name} leads the store with ${topDepartment.booked} booked deals.`
      : "No department data available yet.",
    lowestFrontDepartment
      ? `${lowestFrontDepartment.name} has the lowest front gross contribution.`
      : "No front gross comparison available yet.",
    topSalesperson
      ? `${topSalesperson.name} is the top salesperson with ${topSalesperson.units.toFixed(1)} units.`
      : "No salesperson data available yet.",
    `Average backend gross is ${currency(avgBackGross)} per closed deal.`,
  ];

  const maxDepartmentUnits = Math.max(...departmentStats.map((d) => d.booked), 1);

  function currency(value: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function integer(value: number) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <header className="border-b border-border bg-white/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              DF
            </div>
            <span className="text-sm font-semibold tracking-tight">Data Freaks</span>
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/demo" className="text-foreground font-medium">
              View Demo
            </a>
            <a href="/signup" className="text-muted-foreground hover:text-foreground">
              Sign up
            </a>
            <a href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pt-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Data Freaks Demo
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Freak Chevrolet CDJR · Demo environment
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-sm">
            Demo data · Read-only
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Booked Volume"
            value={integer(bookedVolume)}
            subtext={`${integer(bookedPace)} pace`}
          />
          <MetricCard
            label="Closed Volume"
            value={integer(closedVolume)}
            subtext="Delivered + closed"
          />
          <MetricCard
            label="Closed Gross"
            value={currency(closedGross)}
            subtext={`${currency(closedGrossPace)} pace`}
          />
          <MetricCard
            label="Avg Front Gross"
            value={currency(avgFrontGross)}
            subtext="Per closed deal"
          />
          <MetricCard
            label="Avg Backend Gross"
            value={currency(avgBackGross)}
            subtext="Per closed deal"
          />
          <MetricCard
            label="Working Days"
            value={`${workingDaysCompleted} / ${totalWorkingDays}`}
            subtext="Completed / total"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Units by Department</h2>
                  <p className="text-sm text-slate-500">
                    Visual mix of booked volume across the store
                  </p>
                </div>
                <div className="space-y-4 px-6 py-5">
                  {departmentStats.map((department) => (
                    <div key={department.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="font-medium text-slate-900">{department.name}</div>
                        <div className="text-slate-500">{integer(department.booked)} booked</div>
                      </div>
                      <div className="h-3 w-full rounded-full bg-slate-200">
                        <div
                          className="h-3 rounded-full bg-slate-900"
                          style={{
                            width: `${(department.booked / maxDepartmentUnits) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Department Performance</h2>
                  <p className="text-sm text-slate-500">
                    Closed gross and productivity by department
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-6 py-3">Department</th>
                        <th className="px-4 py-3 text-right">Booked</th>
                        <th className="px-4 py-3 text-right">Closed</th>
                        <th className="px-4 py-3 text-right">Front Gross</th>
                        <th className="px-4 py-3 text-right">Back Gross</th>
                        <th className="px-4 py-3 text-right">Total Gross</th>
                        <th className="px-6 py-3 text-right">Avg / Deal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentStats.map((department) => (
                        <tr key={department.name} className="border-b border-slate-100 text-sm text-slate-700">
                          <td className="px-6 py-4 font-medium text-slate-900">{department.name}</td>
                          <td className="px-4 py-4 text-right">{integer(department.booked)}</td>
                          <td className="px-4 py-4 text-right">{integer(department.closed)}</td>
                          <td className="px-4 py-4 text-right">{currency(department.frontGross)}</td>
                          <td className="px-4 py-4 text-right">{currency(department.backGross)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-900">
                            {currency(department.totalGross)}
                          </td>
                          <td className="px-6 py-4 text-right">{currency(department.avgTotalPerDeal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Deals</h2>
                  <p className="text-sm text-slate-500">Most recent activity in the sales log</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-4 py-3">Stock #</th>
                        <th className="px-4 py-3">Vehicle</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Front</th>
                        <th className="px-4 py-3 text-right">Back</th>
                        <th className="px-6 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDeals.map((deal) => (
                        <tr key={deal.id} className="border-b border-slate-100 text-sm text-slate-700">
                          <td className="px-6 py-4">{deal.sale_date}</td>
                          <td className="px-4 py-4 font-medium text-slate-900">{deal.stock_number ?? "—"}</td>
                          <td className="px-4 py-4">
                            {deal.vehicle_year} {deal.vehicle_make} {deal.vehicle_model}
                          </td>
                          <td className="px-4 py-4">
                            {departmentNameById.get(deal.department_id) ?? "—"}
                          </td>
                          <td className="px-4 py-4 capitalize">{deal.status}</td>
                          <td className="px-4 py-4 text-right">{currency(deal.front_profit ?? 0)}</td>
                          <td className="px-4 py-4 text-right">{currency(deal.back_profit ?? 0)}</td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900">
                            {currency((deal.front_profit ?? 0) + (deal.back_profit ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Sales Leaderboard</h2>
                  <p className="text-sm text-slate-500">Top producers by unit volume</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {salespersonStats.slice(0, 10).map((salesperson, index) => (
                    <div key={salesperson.name} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          #{index + 1}
                        </div>
                        <div className="font-medium text-slate-900">{salesperson.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-900">
                          {salesperson.units.toFixed(1)} units
                        </div>
                        <div className="text-sm text-slate-500">
                          {currency(salesperson.totalGross)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Quick Insights</h2>
                  <p className="text-sm text-slate-500">Auto-generated observations from demo data</p>
                </div>
                <div className="space-y-3 px-6 py-4">
                  {insights.map((insight, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      {insight}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{value}</div>
        <div className="mt-2 text-sm text-slate-500">{subtext}</div>
      </CardContent>
    </Card>
  );
}