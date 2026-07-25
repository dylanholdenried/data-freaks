"use client";

import { useState, useMemo } from "react";

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
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = { deal_id: string; salesperson_id: string; share_percent: number };

type Props = {
  stores: Store[];
  deals: Deal[];
  departments: Department[];
  calendarDays: CalendarDay[];
  goals: Goal[];
  salespeople: Salesperson[];
  dealSalespeople: DealSalesperson[];
  year: number;
  month: number;
};

type NeededDisplay =
  | { kind: "empty" }
  | { kind: "surplus"; units: number } // booked - goal (positive), shown as negative
  | { kind: "rate"; rate: number }; // (goal - booked) / remainingDays

// ── Pure helpers (module-level) ──────────────────────────────────────────────

function storeAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("centralia")) return "#58B8E8";
  if (n.includes("linn")) return "#F5C242";
  return "#94a3b8";
}

// Returns current date/time in America/Chicago — handles CDT/CST automatically
function getCentralTimeParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  return {
    year: get("year"),
    month: get("month"), // 1-based
    day: get("day"),
    hour: get("hour"), // 0-23; Intl returns 24 for midnight, still >= 18, safe
  };
}

// True if this date is a working day for this store.
// Checks override map first; falls back to Mon–Sat (dow 1–6).
function isWorkingDayForStore(
  dow: number,
  dateStr: string,
  overrides: Map<string, boolean>
): boolean {
  if (overrides.has(dateStr)) return overrides.get(dateStr)!;
  return dow >= 1 && dow <= 6;
}

// All working day strings (YYYY-MM-DD) in the month for the given stores.
// A date is working if it's working for ANY selected store (union).
function computeWorkingDays(
  year: number,
  month: number,
  calendarDays: CalendarDay[],
  selectedStoreIds: string[]
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const byStore = new Map<string, Map<string, boolean>>();
  for (const sid of selectedStoreIds) byStore.set(sid, new Map());
  for (const day of calendarDays) {
    const m = byStore.get(day.store_id);
    if (m) m.set(day.date.slice(0, 10), day.is_working_day);
  }
  const result: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const working = selectedStoreIds.some((sid) =>
      isWorkingDayForStore(dow, dateStr, byStore.get(sid) ?? new Map())
    );
    if (working) result.push(dateStr);
  }
  return result;
}

// Cars needed per remaining day, or surplus if already past goal.
function computeNeeded(
  booked: number,
  goal: number | null,
  remainingDays: number
): NeededDisplay {
  if (goal === null || remainingDays === 0) return { kind: "empty" };
  if (booked >= goal) return { kind: "surplus", units: booked - goal };
  return { kind: "rate", rate: (goal - booked) / remainingDays };
}

const fmt$ = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

// Fractional units: whole numbers show clean ("12"), fractions to 1 decimal ("12.5")
function fmtUnits(v: number): string {
  return v === Math.floor(v) ? String(Math.floor(v)) : v.toFixed(1);
}

// ── JSX render helpers ───────────────────────────────────────────────────────

function VsGoalCell({ vsGoal }: { vsGoal: number | null }) {
  if (vsGoal === null) return <span className="text-slate-400">—</span>;
  if (vsGoal >= 0)
    return <span className="font-medium text-emerald-600">+{vsGoal}</span>;
  return <span className="font-medium text-red-500">{vsGoal}</span>;
}

function NeededCell({ n }: { n: NeededDisplay }) {
  if (n.kind === "empty") return <span className="text-slate-400">—</span>;
  if (n.kind === "surplus")
    return <span className="font-medium text-emerald-600">-{n.units}</span>;
  const cls =
    n.rate > 5 ? "font-medium text-red-500" : "font-medium text-amber-500";
  return <span className={cls}>{n.rate.toFixed(1)}</span>;
}

// ── Component ────────────────────────────────────────────────────────────────

// Shared grid template — 10 columns, used by header + every data row
const GRID =
  "xl:grid-cols-[2fr_60px_60px_90px_90px_100px_60px_60px_70px_80px] xl:gap-3";

export default function DashboardClient({
  stores,
  deals,
  departments,
  calendarDays,
  goals,
  salespeople,
  dealSalespeople,
  year,
  month,
}: Props) {
  const [selectedStore, setSelectedStore] = useState<"both" | string>(
    stores.length === 1 ? stores[0].id : "both"
  );

  const { kpis, deptRows, totalsRow, leaderboard, monthLabel } = useMemo(() => {
    const selectedStoreIds =
      selectedStore === "both" ? stores.map((s) => s.id) : [selectedStore];

    // Deal scope
    const scopedDeals = deals.filter((d) => selectedStoreIds.includes(d.store_id));
    const bookedDeals = scopedDeals.filter(
      (d) =>
        d.status === "pending" || d.status === "delivered" || d.status === "closed"
    );
    const closedDeals = scopedDeals.filter((d) => d.status === "closed");
    const bookedCount = bookedDeals.length;
    const closedCount = closedDeals.length;

    // Dept scope + goals
    const scopedDepts = departments
      .filter((d) => selectedStoreIds.includes(d.store_id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const scopedDeptIds = new Set(scopedDepts.map((d) => d.id));
    const goalMap = new Map(
      goals
        .filter((g) => scopedDeptIds.has(g.department_id))
        .map((g) => [g.department_id, g.volume_goal])
    );
    const totalGoal = goals
      .filter((g) => scopedDeptIds.has(g.department_id))
      .reduce((s, g) => s + g.volume_goal, 0);

    // Central time — determines today and the 6 PM cutoff
    const ct = getCentralTimeParts();
    const todayStr = `${ct.year}-${String(ct.month).padStart(2, "0")}-${String(ct.day).padStart(2, "0")}`;
    const pastSixPM = ct.hour >= 18;

    // Working days — reuses verified pace engine, no duplication
    const workingDays = computeWorkingDays(year, month, calendarDays, selectedStoreIds);
    const totalWorkingDays = workingDays.length;
    const completedWorkingDays = workingDays.filter(
      (ds) => ds < todayStr || (ds === todayStr && pastSixPM)
    ).length;
    const remainingWorkingDays = totalWorkingDays - completedWorkingDays;

    // Group pace
    const paceProjection =
      completedWorkingDays > 0
        ? Math.round((bookedCount / completedWorkingDays) * totalWorkingDays)
        : null;

    // Gross totals (split for totals row)
    const totalFront = closedDeals.reduce((s, d) => s + (d.front_profit ?? 0), 0);
    const totalBack = closedDeals.reduce((s, d) => s + (d.back_profit ?? 0), 0);
    const totalGross = totalFront + totalBack;
    const avgGross = closedCount > 0 ? totalGross / closedCount : null;

    // Per-dept rows — same pace formula scoped to each dept
    const deptRows = scopedDepts.map((dept) => {
      const dBooked = bookedDeals.filter((d) => d.department_id === dept.id).length;
      const dClosed = closedDeals.filter((d) => d.department_id === dept.id);
      const front = dClosed.reduce((s, d) => s + (d.front_profit ?? 0), 0);
      const back = dClosed.reduce((s, d) => s + (d.back_profit ?? 0), 0);
      const goal = goalMap.get(dept.id) ?? null;
      const pace =
        completedWorkingDays > 0
          ? Math.round((dBooked / completedWorkingDays) * totalWorkingDays)
          : null;
      return {
        id: dept.id,
        name: dept.name,
        booked: dBooked,
        closed: dClosed.length,
        front: dClosed.length > 0 ? front : null,
        back: dClosed.length > 0 ? back : null,
        total: dClosed.length > 0 ? front + back : null,
        goal,
        pace,
        vsGoal: pace !== null && goal !== null ? pace - goal : null,
        needed: computeNeeded(dBooked, goal, remainingWorkingDays),
      };
    });

    // Group totals row
    const totalsRow = {
      booked: bookedCount,
      closed: closedCount,
      front: closedCount > 0 ? totalFront : null,
      back: closedCount > 0 ? totalBack : null,
      total: closedCount > 0 ? totalGross : null,
      goal: totalGoal > 0 ? totalGoal : null,
      pace: paceProjection,
      vsGoal:
        paceProjection !== null && totalGoal > 0
          ? paceProjection - totalGoal
          : null,
      needed: computeNeeded(
        bookedCount,
        totalGoal > 0 ? totalGoal : null,
        remainingWorkingDays
      ),
    };

    // ── Salesperson leaderboard ──────────────────────────────────────────────
    // Fractional credit: share_percent is whole-number percent (100 = 100%).
    // Scoped via scopedDealMap — only deals in the selected store(s) count.
    const scopedDealMap = new Map(scopedDeals.map((d) => [d.id, d]));
    const spAcc = new Map<
      string,
      { bookedUnits: number; closedUnits: number; totalGross: number }
    >();

    for (const ds of dealSalespeople) {
      const deal = scopedDealMap.get(ds.deal_id);
      if (!deal) continue;
      const isBooked =
        deal.status === "pending" ||
        deal.status === "delivered" ||
        deal.status === "closed";
      if (!isBooked) continue;
      const isClosed = deal.status === "closed";
      const share = (ds.share_percent ?? 0) / 100;
      const acc = spAcc.get(ds.salesperson_id) ?? {
        bookedUnits: 0,
        closedUnits: 0,
        totalGross: 0,
      };
      acc.bookedUnits += share;
      if (isClosed) {
        acc.closedUnits += share;
        acc.totalGross +=
          ((deal.front_profit ?? 0) + (deal.back_profit ?? 0)) * share;
      }
      spAcc.set(ds.salesperson_id, acc);
    }

    const spById = new Map(salespeople.map((sp) => [sp.id, sp]));
    const storeById = new Map(stores.map((s) => [s.id, s.name]));

    const leaderboard = Array.from(spAcc.entries())
      .map(([spId, acc]) => {
        const sp = spById.get(spId);
        return {
          id: spId,
          name: sp?.name ?? "Unknown",
          storeName: storeById.get(sp?.store_id ?? "") ?? "",
          bookedUnits: acc.bookedUnits,
          closedUnits: acc.closedUnits,
          totalGross: acc.totalGross,
          avgGross: acc.closedUnits > 0 ? acc.totalGross / acc.closedUnits : null,
        };
      })
      .filter((r) => r.bookedUnits > 0);

    // Sort by total gross DESC; fall back to booked units when all gross is zero
    const allGrossZero = leaderboard.every((r) => r.totalGross === 0);
    leaderboard.sort((a, b) =>
      allGrossZero
        ? b.bookedUnits - a.bookedUnits
        : b.totalGross - a.totalGross || b.bookedUnits - a.bookedUnits
    );

    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    return {
      kpis: {
        bookedCount,
        closedCount,
        paceProjection,
        totalGoal,
        totalWorkingDays,
        completedWorkingDays,
        remainingWorkingDays,
        totalGross: closedCount > 0 ? totalGross : null,
        avgGross,
      },
      deptRows,
      totalsRow,
      leaderboard,
      monthLabel,
    };
  }, [selectedStore, stores, deals, departments, calendarDays, goals, salespeople, dealSalespeople, year, month]);

  const paceColor =
    kpis.paceProjection === null
      ? "text-white"
      : kpis.totalGoal > 0 && kpis.paceProjection >= kpis.totalGoal
      ? "text-emerald-400"
      : kpis.totalGoal > 0
      ? "text-red-400"
      : "text-white";

  // Leaderboard grid — extra Store column only when viewing both stores
  const showStore = selectedStore === "both";
  const LB_GRID = showStore
    ? "xl:grid-cols-[28px_1fr_100px_70px_70px_110px_100px] xl:gap-3"
    : "xl:grid-cols-[28px_1fr_70px_70px_110px_100px] xl:gap-3";

  return (
    <div className="space-y-5">
      {/* Header + store filter */}
      <section className="rounded-2xl bg-gradient-to-br from-[#071735] via-[#05142e] to-[#031127] p-5 text-white shadow-xl shadow-blue-900/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200/60">
              Sales Command
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{monthLabel}</h1>
            <p className="mt-1 text-xs text-blue-100/50">
              {kpis.completedWorkingDays} of {kpis.totalWorkingDays} working days complete
              {kpis.remainingWorkingDays > 0
                ? ` · ${kpis.remainingWorkingDays} remaining`
                : " · Month complete"}
            </p>
          </div>
          {stores.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white/10 p-1">
              <FilterPill
                label="Both"
                active={selectedStore === "both"}
                accent={null}
                onClick={() => setSelectedStore("both")}
              />
              {stores.map((store) => (
                <FilterPill
                  key={store.id}
                  label={store.name}
                  active={selectedStore === store.id}
                  accent={storeAccent(store.name)}
                  onClick={() => setSelectedStore(store.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          kicker="Booked"
          value={String(kpis.bookedCount)}
          sub="pending · delivered · closed"
        />
        <KpiTile
          kicker="Closed"
          value={String(kpis.closedCount)}
          sub="status = closed"
        />
        <KpiTile
          kicker="Pace Projection"
          value={kpis.paceProjection !== null ? String(kpis.paceProjection) : "—"}
          sub={
            kpis.paceProjection === null
              ? "Calculating — first day in progress"
              : kpis.totalGoal > 0
              ? `of ${kpis.totalGoal} goal`
              : "No goal set this month"
          }
          valueClass={paceColor}
        />
        <KpiTile
          kicker="Working Days"
          value={`${kpis.completedWorkingDays} / ${kpis.totalWorkingDays}`}
          sub={`${kpis.remainingWorkingDays} days remaining`}
        />
        <KpiTile
          kicker="Total Gross"
          value={kpis.totalGross !== null ? fmt$(kpis.totalGross) : "—"}
          sub={kpis.closedCount > 0 ? "all closed deals" : "no closed deals yet"}
        />
        <KpiTile
          kicker="Avg Gross / Deal"
          value={kpis.avgGross !== null ? fmt$(kpis.avgGross) : "—"}
          sub={
            kpis.closedCount > 0
              ? `${kpis.closedCount} closed`
              : "no closed deals yet"
          }
        />
      </div>

      {/* Department pace & gross table */}
      <section className="w-full min-w-0 rounded-2xl border border-[#e7ebf3] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Department Pace &amp; Gross
          </p>
        </div>

        {/* Column headers — desktop only */}
        <div
          className={`hidden border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-2 xl:grid ${GRID}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Department
          </span>
          {[
            "Booked",
            "Closed",
            "Front",
            "Back",
            "Total",
            "Goal",
            "Pace",
            "Vs Goal",
            "Needed/Day",
          ].map((h) => (
            <span
              key={h}
              className="text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              {h}
            </span>
          ))}
        </div>

        <div className="divide-y divide-[#edf1f7]">
          {deptRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              No departments configured.
            </p>
          ) : (
            <>
              {deptRows.map((dept) => (
                <div
                  key={dept.id}
                  className={`px-5 py-3 xl:grid ${GRID} xl:items-center`}
                >
                  {/* Name — always visible */}
                  <span className="block text-sm font-medium text-slate-800">
                    {dept.name}
                  </span>

                  {/* Mobile summary row — hidden on desktop */}
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 xl:hidden">
                    <span>
                      Booked{" "}
                      <strong className="text-slate-700">{dept.booked}</strong>
                    </span>
                    <span>
                      Goal{" "}
                      <strong className="text-slate-700">
                        {dept.goal ?? "—"}
                      </strong>
                    </span>
                    <span>
                      Pace{" "}
                      <strong className="text-slate-700">
                        {dept.pace ?? "—"}
                      </strong>
                    </span>
                    <span>
                      Needed <strong><NeededCell n={dept.needed} /></strong>
                    </span>
                  </div>

                  {/* Desktop cells — hidden on mobile */}
                  <span className="hidden text-right text-sm tabular-nums text-slate-600 xl:block">
                    {dept.booked}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-slate-600 xl:block">
                    {dept.closed}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                    {dept.front !== null ? fmt$(dept.front) : "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                    {dept.back !== null ? fmt$(dept.back) : "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums font-semibold text-slate-800 xl:block">
                    {dept.total !== null ? fmt$(dept.total) : "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                    {dept.goal ?? "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-slate-700 xl:block">
                    {dept.pace ?? "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums xl:block">
                    <VsGoalCell vsGoal={dept.vsGoal} />
                  </span>
                  <span className="hidden text-right text-sm tabular-nums xl:block">
                    <NeededCell n={dept.needed} />
                  </span>
                </div>
              ))}

              {/* Totals row */}
              <div
                className={`bg-[#f8fafd] px-5 py-3 xl:grid ${GRID} xl:items-center`}
              >
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  All Departments
                </span>

                {/* Mobile totals summary */}
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 xl:hidden">
                  <span>
                    Booked{" "}
                    <strong className="text-slate-700">{totalsRow.booked}</strong>
                  </span>
                  <span>
                    Goal{" "}
                    <strong className="text-slate-700">
                      {totalsRow.goal ?? "—"}
                    </strong>
                  </span>
                  <span>
                    Pace{" "}
                    <strong className="text-slate-700">
                      {totalsRow.pace ?? "—"}
                    </strong>
                  </span>
                  <span>
                    Needed <strong><NeededCell n={totalsRow.needed} /></strong>
                  </span>
                </div>

                {/* Desktop totals cells */}
                <span className="hidden text-right text-sm tabular-nums font-bold text-slate-900 xl:block">
                  {totalsRow.booked}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold text-slate-900 xl:block">
                  {totalsRow.closed}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-semibold text-slate-500 xl:block">
                  {totalsRow.front !== null ? fmt$(totalsRow.front) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-semibold text-slate-500 xl:block">
                  {totalsRow.back !== null ? fmt$(totalsRow.back) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold text-slate-900 xl:block">
                  {totalsRow.total !== null ? fmt$(totalsRow.total) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold text-slate-700 xl:block">
                  {totalsRow.goal ?? "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold text-slate-900 xl:block">
                  {totalsRow.pace ?? "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold xl:block">
                  <VsGoalCell vsGoal={totalsRow.vsGoal} />
                </span>
                <span className="hidden text-right text-sm tabular-nums font-bold xl:block">
                  <NeededCell n={totalsRow.needed} />
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Salesperson leaderboard */}
      <section className="w-full min-w-0 rounded-2xl border border-[#e7ebf3] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Salesperson Leaderboard
          </p>
        </div>

        {/* Column headers — desktop only */}
        <div
          className={`hidden border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-2 xl:grid ${LB_GRID}`}
        >
          <span /> {/* rank */}
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Name
          </span>
          {showStore && (
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Store
            </span>
          )}
          {["Booked", "Closed", "Total Gross", "Avg Gross"].map((h) => (
            <span
              key={h}
              className="text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              {h}
            </span>
          ))}
        </div>

        <div className="divide-y divide-[#edf1f7]">
          {leaderboard.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              No deals logged this month.
            </p>
          ) : (
            leaderboard.map((row, idx) => (
              <div
                key={row.id}
                className={`px-5 py-3 xl:grid ${LB_GRID} xl:items-center`}
              >
                {/* Rank */}
                <span
                  className={`text-sm tabular-nums font-bold ${
                    idx === 0 ? "text-amber-500" : "text-slate-300"
                  }`}
                >
                  {idx + 1}
                </span>

                {/* Name — always visible */}
                <span className="block text-sm font-medium text-slate-800">
                  {row.name}
                </span>

                {/* Mobile summary — hidden on desktop */}
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 xl:hidden">
                  {showStore && <span>{row.storeName}</span>}
                  <span>
                    Booked{" "}
                    <strong className="text-slate-700">
                      {fmtUnits(row.bookedUnits)}
                    </strong>
                  </span>
                  <span>
                    Closed{" "}
                    <strong className="text-slate-700">
                      {fmtUnits(row.closedUnits)}
                    </strong>
                  </span>
                  <span>
                    Gross{" "}
                    <strong className="text-slate-700">
                      {row.totalGross > 0 ? fmt$(row.totalGross) : "—"}
                    </strong>
                  </span>
                </div>

                {/* Store — desktop, Both mode only */}
                {showStore && (
                  <span className="hidden text-sm text-slate-500 xl:block">
                    {row.storeName}
                  </span>
                )}

                {/* Desktop cells */}
                <span className="hidden text-right text-sm tabular-nums text-slate-600 xl:block">
                  {fmtUnits(row.bookedUnits)}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-slate-600 xl:block">
                  {fmtUnits(row.closedUnits)}
                </span>
                <span className="hidden text-right text-sm tabular-nums font-semibold text-slate-800 xl:block">
                  {row.totalGross > 0 ? fmt$(row.totalGross) : "—"}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                  {row.avgGross !== null ? fmt$(row.avgGross) : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={active && accent ? { backgroundColor: accent, color: "#0a0a0a" } : undefined}
      className={[
        "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all",
        active && !accent ? "bg-white/20 text-white" : "",
        !active ? "text-blue-100/60 hover:bg-white/10 hover:text-white" : "",
      ]
        .join(" ")
        .trim()}
    >
      {label}
    </button>
  );
}

function KpiTile({
  kicker,
  value,
  sub,
  valueClass = "text-white",
}: {
  kicker: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl bg-[#071735] px-4 py-4 shadow-lg shadow-blue-900/20">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200/60">
        {kicker}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-tight text-blue-100/50">{sub}</p>
    </div>
  );
}
