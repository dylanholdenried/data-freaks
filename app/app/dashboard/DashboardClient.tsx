"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  type CalendarDay,
  type NeededDisplay,
  MONTH_NAMES,
  computePaceSnapshot,
  computeWorkingDays,
  financeLabel,
  fmtCurrency,
  formatSigned,
  isFiDepartment,
} from "@/lib/dashboard/pace";

type Store = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  department_id: string;
  sale_date: string;
  acquisition_source: string | null;
  finance_type: string | null;
};
type Department = { id: string; name: string; store_id: string };
type Goal = { department_id: string; volume_goal: number };

type Props = {
  stores: Store[];
  deals: Deal[];
  departments: Department[];
  calendarDays: CalendarDay[];
  goals: Goal[];
  year: number;
  month: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  currentYear: number;
  currentMonth: number;
};

function isBooked(status: string) {
  return status === "pending" || status === "delivered" || status === "closed";
}

function isClosed(status: string) {
  return status === "closed";
}

function saleMonth(saleDate: string): { year: number; month: number } {
  const d = saleDate.slice(0, 10);
  return {
    year: parseInt(d.slice(0, 4), 10),
    month: parseInt(d.slice(5, 7), 10),
  };
}

function mixRows(
  items: { key: string; count: number }[],
  asPercent: boolean,
  denom: number
): { name: string; value: string; width: number }[] {
  const max = Math.max(...items.map((i) => i.count), 1);
  return items.map((i) => ({
    name: i.key,
    value: asPercent
      ? `${denom > 0 ? Math.round((i.count / denom) * 100) : 0}%`
      : String(i.count),
    width: asPercent
      ? denom > 0
        ? (i.count / denom) * 100
        : 0
      : (i.count / max) * 100,
  }));
}

function countBy(
  deals: Deal[],
  keyFn: (d: Deal) => string
): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of deals) {
    const k = keyFn(d);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export default function DashboardClient({
  stores,
  deals,
  departments,
  calendarDays,
  goals,
  year,
  month,
  isCurrentMonth,
  isFutureMonth,
  currentYear,
  currentMonth,
}: Props) {
  const router = useRouter();
  const [selectedStore, setSelectedStore] = useState<"all" | string>(
    stores.length === 1 ? stores[0].id : "all"
  );
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  // Sync store selection if stores list changes
  useEffect(() => {
    if (stores.length === 1) setSelectedStore(stores[0].id);
  }, [stores]);

  // 60s auto-refresh
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      router.refresh();
      setUpdatedAt(new Date());
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [router]);

  function navigateMonth(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams();
    const ctMatch = nextYear === currentYear && nextMonth === currentMonth;
    if (!ctMatch) {
      params.set("year", String(nextYear));
      params.set("month", String(nextMonth));
    }
    const q = params.toString();
    router.push(q ? `/app/dashboard?${q}` : "/app/dashboard");
  }

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);
    if (!years.includes(year)) years.push(year);
    return years.sort((a, b) => b - a);
  }, [currentYear, year]);

  const { monthLabel, workingMeta, deptSections } =
    useMemo(() => {
      const selectedStoreIds =
        selectedStore === "all" ? stores.map((s) => s.id) : [selectedStore];
      const storeById = new Map(stores.map((s) => [s.id, s.name]));

      const mtdDeals = deals.filter((d) => {
        if (!selectedStoreIds.includes(d.store_id)) return false;
        const sm = saleMonth(d.sale_date);
        return sm.year === year && sm.month === month;
      });

      const scopedDepts = departments
        .filter(
          (d) =>
            selectedStoreIds.includes(d.store_id) && !isFiDepartment(d.name)
        )
        .sort((a, b) => {
          const sa = storeById.get(a.store_id) ?? "";
          const sb = storeById.get(b.store_id) ?? "";
          return sa.localeCompare(sb) || a.name.localeCompare(b.name);
        });

      const goalMap = new Map(
        goals.map((g) => [g.department_id, g.volume_goal])
      );

      const workingDays = computeWorkingDays(
        year,
        month,
        calendarDays,
        selectedStoreIds
      );

      // Shared calendar meta for header (store-scoped)
      const samplePace = computePaceSnapshot(
        0,
        null,
        year,
        month,
        workingDays,
        isCurrentMonth,
        isFutureMonth
      );

      // ── Per-department sections ───────────────────────────────────────────
      const deptSections = scopedDepts.map((dept) => {
        // Working days for this department's store only
        const deptWorkingDays = computeWorkingDays(
          year,
          month,
          calendarDays,
          [dept.store_id]
        );
        const booked = mtdDeals.filter(
          (d) => d.department_id === dept.id && isBooked(d.status)
        );
        const closed = mtdDeals.filter(
          (d) => d.department_id === dept.id && isClosed(d.status)
        );
        const sold = booked.length;
        const goal = goalMap.get(dept.id) ?? null;
        const pace = computePaceSnapshot(
          sold,
          goal,
          year,
          month,
          deptWorkingDays,
          isCurrentMonth,
          isFutureMonth
        );

        const front = closed.reduce((s, d) => s + (d.front_profit ?? 0), 0);
        const back = closed.reduce((s, d) => s + (d.back_profit ?? 0), 0);
        const totalGross = front + back;
        const closedCount = closed.length;

        const sourceCounts = countBy(booked, (d) => {
          const s = d.acquisition_source?.trim();
          return s ? s : "Unspecified";
        });
        const financeCounts = countBy(closed, (d) =>
          financeLabel(d.finance_type)
        );

        const storeName = storeById.get(dept.store_id) ?? "";
        const title =
          selectedStore === "all" && stores.length > 1
            ? `${storeName} · ${dept.name}`
            : dept.name;

        return {
          id: dept.id,
          title,
          storeName,
          deptName: dept.name,
          sold,
          goal,
          pace,
          front,
          back,
          totalGross,
          closedCount,
          avgFront: closedCount > 0 ? front / closedCount : null,
          avgBack: closedCount > 0 ? back / closedCount : null,
          avgTotal: closedCount > 0 ? totalGross / closedCount : null,
          sourceMix: mixRows(sourceCounts, false, booked.length),
          financeMix: mixRows(financeCounts, true, closedCount),
        };
      });

      const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

      return {
        monthLabel,
        workingMeta: samplePace,
        deptSections,
      };
    }, [
      selectedStore,
      stores,
      deals,
      departments,
      calendarDays,
      goals,
      year,
      month,
      isCurrentMonth,
      isFutureMonth,
    ]);

  const updatedLabel = updatedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={cn("pc-command dash-tv space-y-5")}>
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <header className="pc-head dash-tv-head">
        <div>
          <p className="pc-kicker">Sales command</p>
          <h1 className="pc-title">{monthLabel}</h1>
          <p className="pc-meta">
            {workingMeta.completedWorkingDays} of {workingMeta.totalWorkingDays}{" "}
            working days
            {workingMeta.remainingWorkingDays > 0
              ? ` · ${workingMeta.remainingWorkingDays} remaining`
              : isCurrentMonth
                ? ""
                : " · Month complete"}
            {" · "}
            Live · refreshed {updatedLabel}
          </p>
        </div>

        <div className="dash-tv-controls">
          <div className="dash-tv-selects">
            <label>
              <span>Month</span>
              <select
                value={month}
                onChange={(e) => navigateMonth(year, parseInt(e.target.value, 10))}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Year</span>
              <select
                value={year}
                onChange={(e) => navigateMonth(parseInt(e.target.value, 10), month)}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={cn("pc-pill is-soft", isCurrentMonth && "is-active")}
              onClick={() => navigateMonth(currentYear, currentMonth)}
            >
              Current Month
            </button>
          </div>

          {stores.length > 0 && (
            <div className="pc-store-pills" role="group" aria-label="Store">
              <button
                type="button"
                className={cn("pc-pill", selectedStore === "all" && "is-active")}
                onClick={() => setSelectedStore("all")}
              >
                ALL
              </button>
              {stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  className={cn(
                    "pc-pill",
                    selectedStore === store.id && "is-active"
                  )}
                  onClick={() => setSelectedStore(store.id)}
                >
                  {store.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Department sections ───────────────────────────────────────────── */}
      {deptSections.length === 0 ? (
        <div className="pc-panel">
          <p className="dash-tv-empty">No departments configured for this view.</p>
        </div>
      ) : (
        deptSections.map((dept) => (
          <DepartmentSection
            key={dept.id}
            dept={dept}
            year={year}
            month={month}
          />
        ))
      )}
    </div>
  );
}

// ── Department section ───────────────────────────────────────────────────────

type DeptSectionData = {
  id: string;
  title: string;
  sold: number;
  goal: number | null;
  pace: ReturnType<typeof computePaceSnapshot>;
  front: number;
  back: number;
  totalGross: number;
  closedCount: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  sourceMix: { name: string; value: string; width: number }[];
  financeMix: { name: string; value: string; width: number }[];
};

function DepartmentSection({
  dept,
  year,
  month,
}: {
  dept: DeptSectionData;
  year: number;
  month: number;
}) {
  const { pace, goal, sold } = dept;
  const hasGoal = goal !== null && goal > 0;

  return (
    <section className="dash-dept">
      <div className="dash-dept-head">
        <h2>{dept.title}</h2>
        <span>
          {hasGoal ? `Goal ${goal}` : "No volume goal"} · {sold} sold MTD
        </span>
      </div>

      {!hasGoal ? (
        <div className="dash-no-goal">
          <p>No goal set for this month.</p>
          <Link
            href={`/app/setup?year=${year}&month=${month}#goals`}
            className="pc-pill is-active"
          >
            Set Goal
          </Link>
        </div>
      ) : (
        <>
          <div className="dash-pace-kpis">
            <PaceKpi label="Sold MTD" value={String(sold)} />
            <PaceKpi
              label="Pace Line Today"
              value={
                pace.paceLineToday !== null ? String(pace.paceLineToday) : "—"
              }
              accent="amber"
            />
            <PaceKpi
              label="vs Pace"
              value={
                pace.vsPace !== null ? formatSigned(pace.vsPace) : "—"
              }
              accent={
                pace.vsPace === null
                  ? undefined
                  : pace.vsPace >= 0
                    ? "green"
                    : "red"
              }
            />
            <PaceKpi
              label={`To Go (${goal})`}
              value={
                pace.toGo === null
                  ? "—"
                  : pace.toGo <= 0
                    ? `+${Math.abs(pace.toGo)}`
                    : String(pace.toGo)
              }
            />
            <PaceKpi
              label="Need / Biz Day"
              value={<NeededValue n={pace.needed} />}
              accent="blue"
            />
          </div>

          <div className="dash-pace-bar-panel">
            <p className="dash-pace-bar-title">
              Month progress to {goal} — {dept.title}
            </p>
            <div className="dash-pace-track">
              <div
                className="dash-pace-fill"
                style={{
                  width: `${Math.min(100, (sold / goal) * 100)}%`,
                }}
              />
              {pace.paceLineToday !== null && (
                <div
                  className="dash-pace-marker"
                  style={{
                    left: `${Math.min(100, (pace.paceLineToday / goal) * 100)}%`,
                  }}
                  title={`Pace line today: ${pace.paceLineToday}`}
                />
              )}
            </div>
            <p className="dash-pace-caption">
              {sold} of {goal}. Amber line = pace today (
              {pace.paceLineToday ?? "—"}).{" "}
              {pace.remainingWorkingDays > 0
                ? `${pace.remainingWorkingDays} business days left`
                : "Month complete"}
              {pace.needed.kind === "rate"
                ? ` → ${pace.needed.rate.toFixed(1)}/business day.`
                : "."}
            </p>
            <p className="dash-pace-projection">
              Month-end projection:{" "}
              <b>
                {pace.monthEndProjection !== null
                  ? pace.monthEndProjection
                  : "—"}
              </b>
              {" vs goal "}
              <b>{goal}</b>
              {pace.projectionVsGoal !== null && (
                <>
                  {" "}
                  (
                  <span
                    className={
                      pace.projectionVsGoal >= 0 ? "good" : "warn"
                    }
                  >
                    {formatSigned(pace.projectionVsGoal)}
                  </span>
                  )
                </>
              )}
            </p>
          </div>
        </>
      )}

      {/* Gross */}
      <div className="dash-gross-panel">
        <div className="dash-gross-grid">
          <GrossStat label="Total Front" value={fmtCurrency(dept.front)} />
          <GrossStat label="Total Back" value={fmtCurrency(dept.back)} />
          <GrossStat
            label="Total Gross"
            value={fmtCurrency(dept.totalGross)}
            strong
          />
          <GrossStat
            label="Avg Front"
            value={
              dept.avgFront !== null ? fmtCurrency(dept.avgFront) : "—"
            }
          />
          <GrossStat
            label="Avg Back"
            value={dept.avgBack !== null ? fmtCurrency(dept.avgBack) : "—"}
          />
          <GrossStat
            label="Avg / Deal"
            value={
              dept.avgTotal !== null ? fmtCurrency(dept.avgTotal) : "—"
            }
            strong
          />
        </div>
        <p className="dash-tv-footnote">
          Totals and averages use closed deals only ({dept.closedCount} closed).
        </p>
      </div>

      {/* Mix */}
      <div className="da-demo-panel dash-mix-panel">
        <div className="da-demo-panel-head">
          <h3>Acquisition &amp; finance mix</h3>
          <span>Sources = booked · Finance = closed</span>
        </div>
        <div className="da-demo-mix">
          <div>
            <div className="da-demo-mix-label">Sources</div>
            {dept.sourceMix.length === 0 ? (
              <p className="dash-tv-empty">No booked deals.</p>
            ) : (
              dept.sourceMix.map((s) => (
                <div key={s.name} className="da-demo-mix-row">
                  <div className="da-demo-mix-meta">
                    <span>{s.name}</span>
                    <b>{s.value}</b>
                  </div>
                  <div className="da-demo-mix-track">
                    <div style={{ width: `${s.width}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <div className="da-demo-mix-label">Finance</div>
            {dept.financeMix.length === 0 ? (
              <p className="dash-tv-empty">No closed deals.</p>
            ) : (
              dept.financeMix.map((s) => (
                <div key={s.name} className="da-demo-mix-row">
                  <div className="da-demo-mix-meta">
                    <span>{s.name}</span>
                    <b>{s.value}</b>
                  </div>
                  <div className="da-demo-mix-track blue">
                    <div style={{ width: `${s.width}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaceKpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: "amber" | "green" | "red" | "blue";
}) {
  return (
    <div className="dash-pace-kpi">
      <div
        className={cn(
          "dash-pace-kpi-value",
          accent === "amber" && "amber",
          accent === "green" && "green",
          accent === "red" && "red",
          accent === "blue" && "blue"
        )}
      >
        {value}
      </div>
      <div className="dash-pace-kpi-label">{label}</div>
    </div>
  );
}

function NeededValue({ n }: { n: NeededDisplay }) {
  if (n.kind === "empty") return <>—</>;
  if (n.kind === "surplus") return <>—{n.units}</>;
  return <>{n.rate.toFixed(1)}</>;
}

function GrossStat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("dash-gross-stat", strong && "is-strong")}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
