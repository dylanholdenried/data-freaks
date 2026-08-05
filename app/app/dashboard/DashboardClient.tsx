"use client";

import { useEffect, useMemo, useState } from "react";
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
  avgTotal: number | null;
  sourceMix: { name: string; value: string; width: number }[];
  financeMix: { name: string; value: string; width: number }[];
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

/** Compact store pill labels (e.g. Jim Butler Centralia → JB CENTRALIA). */
function shortStoreLabel(name: string): string {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return `JB ${jb[1].trim().toUpperCase()}`;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    const initials = parts
      .slice(0, -1)
      .map((p) => p[0] ?? "")
      .join("");
    return `${initials} ${parts[parts.length - 1]}`.toUpperCase();
  }
  return n.toUpperCase();
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

  useEffect(() => {
    if (stores.length === 1) setSelectedStore(stores[0].id);
  }, [stores]);

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

  const { monthLabel, workingMeta, deptSections, aggregates } = useMemo(() => {
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

    const goalMap = new Map(goals.map((g) => [g.department_id, g.volume_goal]));

    const workingDays = computeWorkingDays(
      year,
      month,
      calendarDays,
      selectedStoreIds
    );

    const samplePace = computePaceSnapshot(
      0,
      null,
      year,
      month,
      workingDays,
      isCurrentMonth,
      isFutureMonth
    );

    const deptSections: DeptSectionData[] = scopedDepts.map((dept) => {
      const deptWorkingDays = computeWorkingDays(year, month, calendarDays, [
        dept.store_id,
      ]);
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

      const completeGross = closed
        .filter(
          (d) =>
            d.front_profit != null &&
            Number.isFinite(d.front_profit) &&
            d.back_profit != null &&
            Number.isFinite(d.back_profit)
        )
        .map((d) => (d.front_profit as number) + (d.back_profit as number));
      const avgTotal =
        completeGross.length > 0
          ? completeGross.reduce((s, v) => s + v, 0) / completeGross.length
          : null;

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
        sold,
        goal,
        pace,
        front,
        back,
        totalGross,
        closedCount,
        avgTotal,
        sourceMix: mixRows(sourceCounts, false, booked.length),
        financeMix: mixRows(financeCounts, true, closedCount),
      };
    });

    let soldSum = 0;
    let goalSum = 0;
    let hasAnyGoal = false;
    let projSum = 0;
    let hasAnyProj = false;
    let grossSum = 0;
    for (const d of deptSections) {
      soldSum += d.sold;
      grossSum += d.totalGross;
      if (d.goal !== null && d.goal > 0) {
        goalSum += d.goal;
        hasAnyGoal = true;
      }
      if (d.pace.monthEndProjection !== null) {
        projSum += d.pace.monthEndProjection;
        hasAnyProj = true;
      }
    }

    const projVsGoal =
      hasAnyProj && hasAnyGoal ? projSum - goalSum : null;

    return {
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      workingMeta: samplePace,
      deptSections,
      aggregates: {
        soldSum,
        goalSum: hasAnyGoal ? goalSum : null,
        projSum: hasAnyProj ? projSum : null,
        projVsGoal,
        grossSum,
      },
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
      <header className="pc-head dash-tv-head">
        <div>
          <p className="pc-kicker">Sales command</p>
          <h1 className="pc-title">{monthLabel}</h1>
          <p className="pc-meta">
            Day {workingMeta.completedWorkingDays} of{" "}
            {workingMeta.totalWorkingDays} working days
            {workingMeta.remainingWorkingDays > 0
              ? ` · ${workingMeta.remainingWorkingDays} remaining`
              : isCurrentMonth
                ? ""
                : " · Month complete"}
            {" · "}
            live {updatedLabel}
          </p>
          <div className="dash-tv-selects dash-tv-selects-inline">
            <label>
              <span>Month</span>
              <select
                value={month}
                onChange={(e) =>
                  navigateMonth(year, parseInt(e.target.value, 10))
                }
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
                onChange={(e) =>
                  navigateMonth(parseInt(e.target.value, 10), month)
                }
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
        </div>

        <div className="dash-tv-controls">
          {stores.length > 0 && (
            <div className="pc-store-pills" role="group" aria-label="Store">
              <button
                type="button"
                className={cn("pc-pill", selectedStore === "all" && "is-active")}
                onClick={() => setSelectedStore("all")}
              >
                All stores
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
                  {shortStoreLabel(store.name)}
                </button>
              ))}
            </div>
          )}

          <div className="dash-agg">
            <div className="dash-agg-item">
              <span className="dash-agg-label">Store MTD</span>
              <span className="dash-agg-value">
                {aggregates.soldSum}
                {aggregates.goalSum !== null && (
                  <span className="dash-agg-muted">
                    {" "}
                    / {aggregates.goalSum}
                  </span>
                )}
              </span>
            </div>
            <div className="dash-agg-item">
              <span className="dash-agg-label">Proj</span>
              <span
                className={cn(
                  "dash-agg-value",
                  aggregates.projVsGoal !== null &&
                    (aggregates.projVsGoal >= 0 ? "is-good" : "is-warn")
                )}
              >
                {aggregates.projSum !== null ? aggregates.projSum : "—"}
                {aggregates.projVsGoal !== null && (
                  <span className="dash-agg-delta">
                    {" "}
                    {formatSigned(aggregates.projVsGoal)}
                  </span>
                )}
              </span>
            </div>
            <div className="dash-agg-item">
              <span className="dash-agg-label">Gross</span>
              <span className="dash-agg-value">
                {fmtCurrency(aggregates.grossSum)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {deptSections.length === 0 ? (
        <div className="pc-panel">
          <p className="dash-tv-empty">
            No departments configured for this view.
          </p>
        </div>
      ) : (
        <>
          <div className="dash-card-grid">
            {deptSections.map((dept) => (
              <DepartmentCard
                key={dept.id}
                dept={dept}
                year={year}
                month={month}
              />
            ))}
          </div>

          <div className="dash-mix-stack">
            {deptSections.map((dept) => (
              <MixPanel key={`mix-${dept.id}`} dept={dept} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DepartmentCard({
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
  const onTrack = pace.vsPace !== null && pace.vsPace >= 0;
  const behind = pace.vsPace !== null && pace.vsPace < 0;
  const projTone =
    pace.projectionVsGoal === null
      ? undefined
      : pace.projectionVsGoal >= 0
        ? "good"
        : "warn";

  const frontPct =
    dept.totalGross > 0 ? (dept.front / dept.totalGross) * 100 : 0;
  const backPct =
    dept.totalGross > 0 ? (dept.back / dept.totalGross) * 100 : 0;

  const soldPct = hasGoal ? Math.min(100, (sold / goal!) * 100) : 0;
  const pacePct =
    hasGoal && pace.paceLineToday !== null
      ? Math.min(100, (pace.paceLineToday / goal!) * 100)
      : null;

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <h2 className="dash-card-title">{dept.title}</h2>
        {!hasGoal ? (
          <span className="dash-status is-muted">No goal</span>
        ) : behind ? (
          <span className="dash-status is-behind">Behind pace</span>
        ) : onTrack ? (
          <span className="dash-status is-on-track">On track</span>
        ) : (
          <span className="dash-status is-muted">—</span>
        )}
      </div>

      {!hasGoal ? (
        <div className="dash-no-goal dash-no-goal-compact">
          <p>
            {sold} sold MTD · no volume goal set
          </p>
          <Link
            href={`/app/setup?year=${year}&month=${month}#goals`}
            className="pc-pill is-active"
          >
            Set Goal
          </Link>
        </div>
      ) : (
        <>
          <div className="dash-sold-proj">
            <div className="dash-sold-proj-main">
              <span className="dash-sold-proj-num">{sold}</span>
              <span className="dash-sold-proj-arrow" aria-hidden>
                →
              </span>
              <span
                className={cn(
                  "dash-sold-proj-num",
                  projTone === "good" && "is-good",
                  projTone === "warn" && "is-warn"
                )}
              >
                {pace.monthEndProjection !== null
                  ? pace.monthEndProjection
                  : "—"}
              </span>
              <span className="dash-sold-proj-label">Sold MTD</span>
              <span className="dash-sold-proj-arrow-spacer" aria-hidden />
              <span className="dash-sold-proj-label">Pace</span>
            </div>
            {pace.projectionVsGoal !== null && (
              <span
                className={cn(
                  "dash-sold-proj-delta",
                  pace.projectionVsGoal >= 0 ? "is-good" : "is-warn"
                )}
              >
                {formatSigned(pace.projectionVsGoal)}
              </span>
            )}
          </div>

          <div className="dash-vol-bar">
            <div className="dash-pace-track dash-pace-track-compact">
              <div
                className="dash-pace-fill"
                style={{ width: `${soldPct}%` }}
              />
              {pacePct !== null && (
                <div
                  className="dash-pace-marker"
                  style={{ left: `${pacePct}%` }}
                  title={`Pace line today: ${pace.paceLineToday}`}
                />
              )}
              <div className="dash-goal-tick" title={`Goal ${goal}`} />
            </div>
          </div>

          <div className="dash-vol-stats">
            <div className="dash-vol-key">
              <div className="dash-vol-key-row">
                <span className="dash-vol-key-label">
                  <i className="dash-leg-sold" />
                  Sold&nbsp;:
                </span>
                <span className="dash-vol-key-value">{sold}</span>
              </div>
              <div className="dash-vol-key-row">
                <span className="dash-vol-key-label">
                  <i className="dash-leg-pace" />
                  Target Pace&nbsp;:
                </span>
                <span className="dash-vol-key-value">
                  {pace.paceLineToday ?? "—"}
                </span>
              </div>
              <div className="dash-vol-key-row">
                <span className="dash-vol-key-label">
                  <i className="dash-leg-goal" />
                  Goal&nbsp;:
                </span>
                <span className="dash-vol-key-value">{goal}</span>
              </div>
            </div>

            <div className="dash-mini-row">
              <div className="dash-mini">
                <span className="dash-mini-value is-blue">
                  <NeededValue n={pace.needed} />
                </span>
                <span className="dash-mini-label">Need / day</span>
              </div>
              <div className="dash-mini">
                <span className="dash-mini-value">
                  {pace.toGo === null
                    ? "—"
                    : pace.toGo <= 0
                      ? `+${Math.abs(pace.toGo)}`
                      : String(pace.toGo)}
                </span>
                <span className="dash-mini-label">To go</span>
              </div>
              <div className="dash-mini">
                <span
                  className={cn(
                    "dash-mini-value",
                    pace.vsPace === null
                      ? undefined
                      : pace.vsPace >= 0
                        ? "is-good"
                        : "is-warn"
                  )}
                >
                  {pace.vsPace !== null ? formatSigned(pace.vsPace) : "—"}
                </span>
                <span className="dash-mini-label">Vs pace</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="dash-card-gross">
        <div className="dash-card-gross-head">
          <span className="dash-mini-label">Total gross</span>
          <span className="dash-card-gross-total">
            {fmtCurrency(dept.totalGross)}
          </span>
        </div>
        <div className="dash-gross-bar" role="img" aria-label="Front and back gross">
          {dept.totalGross > 0 ? (
            <>
              <div
                className="dash-gross-bar-front"
                style={{ width: `${frontPct}%` }}
              />
              <div
                className="dash-gross-bar-back"
                style={{ width: `${backPct}%` }}
              />
            </>
          ) : (
            <div className="dash-gross-bar-empty" />
          )}
        </div>
        <div className="dash-gross-legend">
          <span>
            <i className="dash-leg-front" /> front {fmtCurrency(dept.front)}
          </span>
          <span>
            <i className="dash-leg-back" /> back {fmtCurrency(dept.back)}
          </span>
        </div>
        <p className="dash-card-avg">
          avg / deal{" "}
          {dept.avgTotal !== null ? fmtCurrency(dept.avgTotal) : "—"}
        </p>
      </div>
    </section>
  );
}

function MixPanel({ dept }: { dept: DeptSectionData }) {
  return (
    <div className="da-demo-panel dash-mix-panel">
      <div className="da-demo-panel-head">
        <h3>{dept.title} — Acquisition &amp; finance mix</h3>
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
  );
}

function NeededValue({ n }: { n: NeededDisplay }) {
  if (n.kind === "empty") return <>—</>;
  if (n.kind === "surplus") return <>—{n.units}</>;
  return <>{n.rate.toFixed(1)}</>;
}
