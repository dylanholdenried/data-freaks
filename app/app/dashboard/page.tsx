import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Deal = {
  id: string;
  status: "pending" | "delivered" | "closed" | "dead" | "unwound";
  sale_date: string;
  front_profit: number | null;
  back_profit: number | null;
  department_id: string;
};
type Department = { id: string; name: string };
type Salesperson = { id: string; first_name: string; last_name: string };
type DealSalesperson = { deal_id: string; salesperson_id: string; share_percent: number };
type CalendarDay = { calendar_date: string; is_working_day: boolean };

function asCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  );
}

function inCurrentMonth(dateInput: string) {
  const d = new Date(dateInput);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default async function AppDashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const { data: stores } = await supabase.from("stores").select("id,name").eq("dealer_group_id", profile?.dealer_group_id);
  const storeIds = (stores ?? []).map((s: any) => s.id);
  const [{ data: deals }, { data: departments }, { data: salespeople }, { data: assignments }, { data: calendarDays }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("id,status,sale_date,front_profit,back_profit,department_id")
        .eq("dealer_group_id", profile?.dealer_group_id),
      supabase.from("departments").select("id,name").in("store_id", storeIds),
      supabase.from("salespeople").select("id,first_name,last_name").in("store_id", storeIds),
      supabase.from("deal_salespeople").select("deal_id,salesperson_id,share_percent"),
      supabase.from("store_calendar_days").select("calendar_date,is_working_day").in("store_id", storeIds)
    ]);

  const dealRows = ((deals as Deal[]) ?? []).filter((d) => inCurrentMonth(d.sale_date));
  const departmentRows = (departments as Department[]) ?? [];
  const salespersonRows = (salespeople as Salesperson[]) ?? [];
  const assignmentRows = (assignments as DealSalesperson[]) ?? [];
  const calendarRows = ((calendarDays as CalendarDay[]) ?? []).filter((d) => inCurrentMonth(d.calendar_date));

  const bookedDeals = dealRows.filter((d) => d.status !== "dead" && d.status !== "unwound");
  const closedDeals = dealRows.filter((d) => d.status === "closed");
  const bookedVolume = bookedDeals.length;
  const closedVolume = closedDeals.length;
  const closedGross = closedDeals.reduce((sum, d) => sum + (d.front_profit ?? 0) + (d.back_profit ?? 0), 0);

  const today = new Date();
  const workingDays = calendarRows.filter((d) => d.is_working_day);
  const workingDaysCompleted = workingDays.filter((d) => new Date(d.calendar_date) <= new Date(today.toDateString())).length;
  const totalWorkingDays = workingDays.length;
  const daysRemaining = Math.max(totalWorkingDays - workingDaysCompleted, 0);
  const pace = (value: number) => (workingDaysCompleted > 0 ? (value / workingDaysCompleted) * totalWorkingDays : null);

  const departmentMetrics = departmentRows.map((dept) => {
    const deptBooked = bookedDeals.filter((d) => d.department_id === dept.id).length;
    const deptClosedDeals = closedDeals.filter((d) => d.department_id === dept.id);
    const deptGross = deptClosedDeals.reduce((sum, d) => sum + (d.front_profit ?? 0) + (d.back_profit ?? 0), 0);
    return {
      id: dept.id,
      name: dept.name,
      booked: deptBooked,
      closed: deptClosedDeals.length,
      bookedPace: pace(deptBooked),
      closedGross: deptGross,
      closedGrossPace: pace(deptGross)
    };
  });

  const salespersonMap = new Map<string, { name: string; booked: number; closed: number; gross: number }>();
  for (const a of assignmentRows) {
    const deal = dealRows.find((d) => d.id === a.deal_id);
    if (!deal || deal.status === "dead" || deal.status === "unwound") continue;
    const sp = salespersonRows.find((s) => s.id === a.salesperson_id);
    if (!sp) continue;
    const share = (a.share_percent ?? 50) / 100;
    const current = salespersonMap.get(sp.id) ?? { name: `${sp.first_name} ${sp.last_name}`, booked: 0, closed: 0, gross: 0 };
    current.booked += share;
    if (deal.status === "closed") {
      current.closed += share;
      current.gross += ((deal.front_profit ?? 0) + (deal.back_profit ?? 0)) * share;
    }
    salespersonMap.set(sp.id, current);
  }
  const leaderboard = Array.from(salespersonMap.values()).sort((a, b) => b.gross - a.gross).slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-kicker">Sales Registry</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Executive Command Deck</h1>
            <p className="mt-1 text-sm text-slate-500">
              Month-to-date performance across booked volume, gross pace, and originator productivity.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">
            Pace Velocity · {workingDaysCompleted}/{totalWorkingDays || 0} Operating Days
          </Badge>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <Metric label="Booked Volume" value={String(bookedVolume)} sub={pace(bookedVolume) ? `${pace(bookedVolume)!.toFixed(1)} pace` : "No pace yet"} />
        <Metric label="Closed Volume" value={String(closedVolume)} sub="Closed only" />
        <Metric label="Closed Gross" value={asCurrency(closedGross)} sub={pace(closedGross) ? `${asCurrency(pace(closedGross)!)} pace` : "No pace yet"} />
        <Metric label="Working Days" value={`${workingDaysCompleted} / ${totalWorkingDays}`} sub={`${daysRemaining} days remaining`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-[#edf1f7]">
            <div>
              <CardTitle className="text-lg">Sector Performance Matrix</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Booked, closed, and pace projections by department.</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="rounded-none border-0">
              <TableHeader className="bg-[#f8fafd]">
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
                {departmentMetrics.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-slate-800">{d.name}</TableCell>
                    <TableCell>{d.booked}</TableCell>
                    <TableCell>{d.closed}</TableCell>
                    <TableCell>{d.bookedPace ? d.bookedPace.toFixed(1) : "—"}</TableCell>
                    <TableCell>{asCurrency(d.closedGross)}</TableCell>
                    <TableCell>{d.closedGrossPace ? asCurrency(d.closedGrossPace) : "—"}</TableCell>
                  </TableRow>
                ))}
                {departmentMetrics.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-slate-500">
                      No departments configured yet. Add them in Setup.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="app-panel border-[#e7ebf3] shadow-none">
            <CardHeader className="border-[#edf1f7]">
              <CardTitle className="text-lg">Top Originators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaderboard.length === 0 && <p className="text-sm text-slate-500">No deals entered this month.</p>}
              {leaderboard.map((sp, idx) => (
                <div key={sp.name} className="flex items-center justify-between rounded-xl border border-[#edf1f7] bg-[#fafcff] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">#{idx + 1} {sp.name}</p>
                    <p className="text-[11px] text-slate-500">{sp.booked.toFixed(1)} booked · {sp.closed.toFixed(1)} closed</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{asCurrency(sp.gross)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-gradient-to-br from-[#081d48] to-[#102a69] text-white shadow-xl shadow-blue-900/25">
            <CardContent className="p-5">
              <p className="app-kicker text-blue-200">Growth Forecast</p>
              <p className="mt-2 text-lg font-semibold">Booked pace projects {pace(bookedVolume) ? pace(bookedVolume)!.toFixed(0) : "—"} total units.</p>
              <p className="mt-2 text-xs text-blue-100/80">
                Keep entering pending + delivered transactions daily to keep pace accuracy tight.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="app-panel border-[#e7ebf3] shadow-none">
      <CardContent className="p-5">
        <p className="app-kicker">{label}</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="mt-2 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}
