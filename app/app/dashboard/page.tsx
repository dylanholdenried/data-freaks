import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DealStatus = "pending" | "delivered" | "closed" | "dead" | "unwound";

type Deal = {
  id: string;
  status: DealStatus;
  sale_date: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  department_id: string;
};

type Department = { id: string; name: string; store_id: string };
type Salesperson = { id: string; first_name: string; last_name: string; store_id: string };
type DealSalesperson = { deal_id: string; salesperson_id: string; share_percent: number };
type CalendarDay = { store_id: string; calendar_date: string; is_working_day: boolean };

function computeMetrics(params: {
  deals: Deal[];
  departments: Department[];
  salespeople: Salesperson[];
  dealSalespeople: DealSalesperson[];
  calendarDays: CalendarDay[];
}) {
  const { deals, departments, salespeople, dealSalespeople, calendarDays } = params;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const isInMonth = (d: string) => {
    const dt = new Date(d);
    return dt.getFullYear() === year && dt.getMonth() === month;
  };

  const mtdDeals = deals.filter((d) => isInMonth(d.sale_date));

  const bookedVolume = mtdDeals.filter((d) => d.status !== "dead" && d.status !== "unwound").length;
  const closedDeals = mtdDeals.filter((d) => d.status === "closed");
  const closedVolume = closedDeals.length;

  const closedGross = closedDeals.reduce((sum, d) => {
    const front = d.front_profit ?? 0;
    const back = d.back_profit ?? 0;
    return sum + front + back;
  }, 0);

  const monthCalendar = calendarDays.filter((d) => {
    const dt = new Date(d.calendar_date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });

  const workingDays = monthCalendar.filter((d) => d.is_working_day);
  const workingDaysCompleted = workingDays.filter(
    (d) => new Date(d.calendar_date) <= new Date(today.toDateString())
  ).length;
  const totalWorkingDays = workingDays.length;
  const daysRemaining = Math.max(totalWorkingDays - workingDaysCompleted, 0);

  const computePace = (value: number) => {
    if (!workingDaysCompleted || !totalWorkingDays) return null;
    return (value / workingDaysCompleted) * totalWorkingDays;
  };

  const bookedPace = computePace(bookedVolume);
  const closedGrossPace = computePace(closedGross);

  const deptStats = departments.map((dept) => {
    const deptDeals = mtdDeals.filter((d) => d.department_id === dept.id);
    const deptBooked = deptDeals.filter((d) => d.status !== "dead" && d.status !== "unwound").length;
    const deptClosedDeals = deptDeals.filter((d) => d.status === "closed");
    const deptClosed = deptClosedDeals.length;
    const deptGross = deptClosedDeals.reduce((sum, d) => {
      const front = d.front_profit ?? 0;
      const back = d.back_profit ?? 0;
      return sum + front + back;
    }, 0);

    return {
      department: dept,
      bookedVolume: deptBooked,
      closedVolume: deptClosed,
      bookedPace: computePace(deptBooked),
      closedGross: deptGross,
      closedGrossPace: computePace(deptGross)
    };
  });

  const salespersonMap = new Map<string, { salesperson: Salesperson; bookedVolume: number; closedVolume: number; closedGross: number }>();

  for (const dsp of dealSalespeople) {
    const deal = mtdDeals.find((d) => d.id === dsp.deal_id);
    if (!deal) continue;
    if (deal.status === "dead" || deal.status === "unwound") continue;
    const sp = salespeople.find((s) => s.id === dsp.salesperson_id);
    if (!sp) continue;

    const key = sp.id;
    const existing =
      salespersonMap.get(key) ?? { salesperson: sp, bookedVolume: 0, closedVolume: 0, closedGross: 0 };

    const share = (dsp.share_percent ?? 50) / 100;
    existing.bookedVolume += 1 * share;
    if (deal.status === "closed") {
      existing.closedVolume += 1 * share;
      const gross = (deal.front_profit ?? 0) + (deal.back_profit ?? 0);
      existing.closedGross += gross * share;
    }

    salespersonMap.set(key, existing);
  }

  const salespersonRows = Array.from(salespersonMap.values()).sort(
    (a, b) => b.closedGross - a.closedGross
  );

  return {
    bookedVolume,
    closedVolume,
    closedGross,
    bookedPace,
    closedGrossPace,
    workingDaysCompleted,
    totalWorkingDays,
    daysRemaining,
    departmentRows: deptStats,
    salespersonRows
  };
}

export default async function AppDashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const userId = session?.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,dealer_group_id,role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    throw new Error("Profile not found");
  }

  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .eq("dealer_group_id", profile.dealer_group_id);

  const storeIds = (stores ?? []).map((s: { id: string }) => s.id);

  const [{ data: deals }, { data: departments }, { data: salespeople }, { data: dealSalespeople }, { data: calendarDays }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("id,status,sale_date,front_profit,back_profit,store_id,department_id")
        .eq("dealer_group_id", profile.dealer_group_id),
      supabase
        .from("departments")
        .select("id,name,store_id")
        .in("store_id", storeIds),
      supabase
        .from("salespeople")
        .select("id,first_name,last_name,store_id")
        .in("store_id", storeIds),
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent"),
      supabase
        .from("store_calendar_days")
        .select("store_id,calendar_date,is_working_day")
        .in("store_id", storeIds)
    ]);

  const metrics = computeMetrics({
    deals: (deals as Deal[]) ?? [],
    departments: (departments as Department[]) ?? [],
    salespeople: (salespeople as Salesperson[]) ?? [],
    dealSalespeople: (dealSalespeople as DealSalesperson[]) ?? [],
    calendarDays: (calendarDays as CalendarDay[]) ?? []
  });

  const asCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

  const summaryCards = [
    { label: "Booked Volume", value: metrics.bookedVolume.toFixed(0) },
    { label: "Closed Volume", value: metrics.closedVolume.toFixed(0) },
    { label: "Closed Gross", value: asCurrency(metrics.closedGross) },
    { label: "Booked Pace", value: metrics.bookedPace != null ? metrics.bookedPace.toFixed(1) : "—" },
    { label: "Closed Gross Pace", value: metrics.closedGrossPace != null ? asCurrency(metrics.closedGrossPace) : "—" },
    { label: "Working Days", value: `${metrics.workingDaysCompleted} / ${metrics.totalWorkingDays}` },
    { label: "Days Remaining", value: `${metrics.daysRemaining}` }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales log dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Month-to-date booked vs closed volume, gross, and salesperson performance across your group.
          </p>
        </div>
        <Badge variant="outline">Live tenant · Authenticated</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-base font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr,2fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">Departments</CardTitle>
            <span className="text-xs text-muted-foreground">Current month</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead>Booked Pace</TableHead>
                  <TableHead>Closed Gross</TableHead>
                  <TableHead>Gross Pace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.departmentRows.map((row) => (
                  <TableRow key={row.department.id}>
                    <TableCell>{row.department.name}</TableCell>
                    <TableCell>{row.bookedVolume.toFixed(0)}</TableCell>
                    <TableCell>{row.closedVolume.toFixed(0)}</TableCell>
                    <TableCell>{row.bookedPace != null ? row.bookedPace.toFixed(1) : "—"}</TableCell>
                    <TableCell>{asCurrency(row.closedGross)}</TableCell>
                    <TableCell>{row.closedGrossPace != null ? asCurrency(row.closedGrossPace) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">Salesperson leaderboard</CardTitle>
            <span className="text-xs text-muted-foreground">By closed gross</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.salespersonRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No deals entered yet for this month.</p>
            )}
            {metrics.salespersonRows.map((row) => (
              <div key={row.salesperson.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">
                    {row.salesperson.last_name}, {row.salesperson.first_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.bookedVolume.toFixed(1)} booked · {row.closedVolume.toFixed(1)} closed
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Closed gross</div>
                  <div className="text-sm font-semibold">{asCurrency(row.closedGross)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}