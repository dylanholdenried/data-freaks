"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  type CalendarDay,
  type NeededDisplay,
  type PaceSnapshot,
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
  viewOnly?: boolean;
};

type DeptSectionData = {
  id: string;
  storeId: string;
  title: string;
  sold: number;
  pendingCount: number;
  goal: number | null;
  pace: PaceSnapshot;
  front: number;
  back: number;
  totalGross: number;
  closedCount: number;
  avgTotal: number | null;
  avgFront: number | null;
  avgBack: number | null;
  sourceMix: { name: string; value: string; width: number }[];
  financeMix: { name: string; value: string; width: number }[];
};

type StoreSectionData = {
  id: string;
  name: string;
  sold: number;
  pendingCount: number;
  goal: number | null;
  pace: PaceSnapshot;
  totalGross: number;
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

function toGoDisplay(toGo: number | null): string {
  if (toGo === null) return "—";
  if (toGo <= 0) return `+${Math.abs(toGo)}`;
  return String(toGo);
}

function SignedMoney({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  return (
    <span className={cn(value >= 0 ? "is-good" : "is-warn")}>
      {fmtCurrency(value)}
    </span>
  );
}

function PaceBar({
  sold,
  goal,
  paceLineToday,
  compact = false,
  showLegend = false,
}: {
  sold: number;
  goal: number;
  paceLineToday: number | null;
  compact?: boolean;
  showLegend?: boolean;
}) {
  const soldPct = Math.min(100, (sold / goal) * 100);
  const pacePct =
    paceLineToday !== null
      ? Math.min(100, (paceLineToday / goal) * 100)
      : null;

  return (
    <div className="dash-vol-bar">
      <div
        className={cn(
          "dash-pace-track",
          compact ? "dash-pace-track-compact" : "dash-pace-track-store"
        )}
      >
        <div className="dash-pace-fill" style={{ width: `${soldPct}%` }} />
        {pacePct !== null && (
          <div
            className="dash-pace-marker"
            style={{ left: `${pacePct}%` }}
            title={`Pace line today: ${paceLineToday}`}
          />
        )}
        <div className="dash-goal-tick" title={`Goal ${goal}`} />
      </div>
      {showLegend ? (
        <div className="dash-pace-legend">
          <span>
            <i className="dash-leg-sold" />
            Sold {sold}
          </span>
          <span>
            <i className="dash-leg-pace" />
            Target Pace {paceLineToday ?? "—"}
          </span>
          <span>
            <i className="dash-leg-goal" />
            Goal {goal}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StatusMark({
  hasGoal,
  behind,
  onTrack,
}: {
  hasGoal: boolean;
  behind: boolean;
  onTrack: boolean;
}) {
  if (!hasGoal) {
    return <span className="dash-status-text is-muted">No goal</span>;
  }
  if (behind) {
    return (
      <span className="dash-status-text is-behind">
        <span aria-hidden>▼</span> Behind pace
      </span>
    );
  }
  if (onTrack) {
    return (
      <span className="dash-status-text is-on-track">
        <span aria-hidden>▲</span> On track
      </span>
    );
  }
  return <span className="dash-status-text is-muted">—</span>;
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
  viewOnly = false,
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

  const { monthLabel, workingMeta, deptSections, storeSections, aggregates } =
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
        const pendingCount = mtdDeals.filter(
          (d) => d.department_id === dept.id && d.status === "pending"
        ).length;
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
        const avgFront = closedCount > 0 ? front / closedCount : null;
        const avgBack = closedCount > 0 ? back / closedCount : null;

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
            ? `${shortStoreLabel(storeName)} · ${dept.name}`
            : dept.name;

        return {
          id: dept.id,
          storeId: dept.store_id,
          title,
          sold,
          pendingCount,
          goal,
          pace,
          front,
          back,
          totalGross,
          closedCount,
          avgTotal,
          avgFront,
          avgBack,
          sourceMix: mixRows(sourceCounts, false, booked.length),
          financeMix: mixRows(financeCounts, true, closedCount),
        };
      });

      const storeSections: StoreSectionData[] = selectedStoreIds
        .map((storeId) => {
          const storeName = storeById.get(storeId);
          if (!storeName) return null;
          const depts = deptSections.filter((d) => d.storeId === storeId);
          if (depts.length === 0) return null;

          let sold = 0;
          let pendingCount = 0;
          let goalSum = 0;
          let hasGoal = false;
          let totalGross = 0;
          for (const d of depts) {
            sold += d.sold;
            pendingCount += d.pendingCount;
            totalGross += d.totalGross;
            if (d.goal !== null && d.goal > 0) {
              goalSum += d.goal;
              hasGoal = true;
            }
          }
          const goal = hasGoal ? goalSum : null;
          const storeWorkingDays = computeWorkingDays(
            year,
            month,
            calendarDays,
            [storeId]
          );
          const pace = computePaceSnapshot(
            sold,
            goal,
            year,
            month,
            storeWorkingDays,
            isCurrentMonth,
            isFutureMonth
          );

          return {
            id: storeId,
            name: storeName,
            sold,
            pendingCount,
            goal,
            pace,
            totalGross,
          };
        })
        .filter((s): s is StoreSectionData => s !== null);

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
        storeSections,
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
              <span className="dash-agg-label">Projected</span>
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
          {storeSections.length > 0 ? (
            <section className="dash-store-totals" aria-label="Store totals">
              <p className="dash-section-label">Store totals</p>
              <div className="dash-store-stack">
                {storeSections.map((store) => (
                  <StoreRow key={store.id} store={store} />
                ))}
              </div>
            </section>
          ) : null}

          <div className="dash-card-grid">
            {deptSections.map((dept) => (
              <DepartmentCard
                key={dept.id}
                dept={dept}
                year={year}
                month={month}
                viewOnly={viewOnly}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StoreRow({ store }: { store: StoreSectionData }) {
  const { pace, goal, sold } = store;
  const hasGoal = goal !== null && goal > 0;
  const onTrack = pace.vsPace !== null && pace.vsPace >= 0;
  const behind = pace.vsPace !== null && pace.vsPace < 0;
  const projTone =
    pace.projectionVsGoal === null
      ? undefined
      : pace.projectionVsGoal >= 0
        ? "good"
        : "warn";

  return (
    <article className="dash-store-row">
      <div className="dash-store-row-identity">
        <h2 className="dash-store-row-name">{store.name.toUpperCase()}</h2>
        <div className="dash-store-row-status">
          <StatusMark hasGoal={hasGoal} behind={behind} onTrack={onTrack} />
          {store.pendingCount > 0 ? (
            <span className="dash-store-awaiting">
              {store.pendingCount} Awaiting delivery
            </span>
          ) : null}
        </div>
      </div>

      <div className="dash-store-row-sold">
        <div className="dash-sold-proj-main dash-sold-proj-main-inline">
          <span className="dash-sold-proj-num">{sold}</span>
          <span
            className={cn(
              "dash-sold-proj-num",
              projTone === "good" && "is-good",
              projTone === "warn" && "is-warn"
            )}
          >
            {pace.monthEndProjection !== null ? pace.monthEndProjection : "—"}
          </span>
          {pace.projectionVsGoal !== null ? (
            <span
              className={cn(
                "dash-sold-proj-delta",
                pace.projectionVsGoal >= 0 ? "is-good" : "is-warn"
              )}
            >
              {formatSigned(pace.projectionVsGoal)}
            </span>
          ) : null}
          <span className="dash-sold-proj-label">Sold MTD</span>
          <span className="dash-sold-proj-label">Pace</span>
          <span className="dash-sold-proj-label dash-sold-proj-label-spacer" />
        </div>
      </div>

      <div className="dash-store-row-pace">
        {hasGoal ? (
          <PaceBar
            sold={sold}
            goal={goal!}
            paceLineToday={pace.paceLineToday}
            showLegend
          />
        ) : (
          <p className="dash-store-no-goal">{sold} sold MTD · no volume goal</p>
        )}
      </div>

      <div className="dash-store-row-metrics">
        <div className="dash-mini">
          <span className="dash-mini-value is-blue">
            <NeededValue n={pace.needed} />
          </span>
          <span className="dash-mini-label">Need / day</span>
        </div>
        <div className="dash-mini">
          <span className="dash-mini-value">{toGoDisplay(pace.toGo)}</span>
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
        <div className="dash-mini">
          <span
            className={cn(
              "dash-mini-value",
              store.totalGross >= 0 ? "is-good" : "is-warn"
            )}
          >
            {fmtCurrency(store.totalGross)}
          </span>
          <span className="dash-mini-label">Gross MTD</span>
        </div>
      </div>
    </article>
  );
}

function DepartmentCard({
  dept,
  year,
  month,
  viewOnly = false,
}: {
  dept: DeptSectionData;
  year: number;
  month: number;
  viewOnly?: boolean;
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

  const grossMax = Math.max(
    Math.abs(dept.totalGross),
    Math.abs(dept.front),
    Math.abs(dept.back),
    1
  );

  const viewAllHref = `/app/deals?status=all&store=${encodeURIComponent(dept.storeId)}&department=${encodeURIComponent(dept.id)}&year=${year}&month=${month}`;

  const awaitingHref =
    dept.pendingCount > 0
      ? `/app/deals?status=pending&store=${encodeURIComponent(dept.storeId)}&department=${encodeURIComponent(dept.id)}&year=${year}&month=${month}`
      : null;

  const awaitingChip =
    awaitingHref != null ? (
      <Link href={awaitingHref} className="dash-awaiting" prefetch>
        {dept.pendingCount} Awaiting Delivery
      </Link>
    ) : null;

  const financeLine =
    dept.financeMix.length > 0
      ? `FIN ${dept.financeMix.map((f) => `${f.name} ${f.value}`).join(" · ")}`
      : null;

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <h2 className="dash-card-title">{dept.title}</h2>
        <StatusMark hasGoal={hasGoal} behind={behind} onTrack={onTrack} />
      </div>

      {!hasGoal ? (
        <div className="dash-no-goal dash-no-goal-compact">
          <p>{sold} sold MTD · no volume goal set</p>
          <div className="dash-no-goal-actions">
            <Link href={viewAllHref} className="dash-view-deals" prefetch>
              View all deals
            </Link>
            {awaitingChip}
            {!viewOnly ? (
              <Link
                href={`/app/setup?year=${year}&month=${month}#goals`}
                className="pc-pill is-active"
              >
                Set Goal
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="dash-sold-proj">
            <div className="dash-sold-proj-main">
              <span className="dash-sold-proj-num">{sold}</span>
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
              {pace.projectionVsGoal !== null ? (
                <span
                  className={cn(
                    "dash-sold-proj-delta",
                    pace.projectionVsGoal >= 0 ? "is-good" : "is-warn"
                  )}
                >
                  {formatSigned(pace.projectionVsGoal)}
                </span>
              ) : (
                <span className="dash-sold-proj-delta-spacer" aria-hidden />
              )}
              <span className="dash-sold-proj-label">Sold MTD</span>
              <span className="dash-sold-proj-label">Pace</span>
              <span className="dash-sold-proj-label dash-sold-proj-label-spacer" />
            </div>
            <div className="dash-sold-proj-side">
              <Link href={viewAllHref} className="dash-view-deals" prefetch>
                View all deals →
              </Link>
              {awaitingChip}
            </div>
          </div>

          <PaceBar
            sold={sold}
            goal={goal!}
            paceLineToday={pace.paceLineToday}
            compact
            showLegend
          />

          <div className="dash-mini-row">
            <div className="dash-mini">
              <span className="dash-mini-value is-blue">
                <NeededValue n={pace.needed} />
              </span>
              <span className="dash-mini-label">Need / day</span>
            </div>
            <div className="dash-mini">
              <span className="dash-mini-value">{toGoDisplay(pace.toGo)}</span>
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
        </>
      )}

      <div className="dash-card-gross">
        <div className="dash-gross-table-head">
          <span className="dash-mini-label">Gross</span>
          <span className="dash-mini-label">MTD</span>
          <span className="dash-mini-label">Avg / deal</span>
        </div>
        {(
          [
            {
              key: "total",
              label: "Total",
              mtd: dept.totalGross,
              avg: dept.avgTotal,
            },
            {
              key: "front",
              label: "Front",
              mtd: dept.front,
              avg: dept.avgFront,
            },
            {
              key: "back",
              label: "Back",
              mtd: dept.back,
              avg: dept.avgBack,
            },
          ] as const
        ).map((row) => {
          const width = Math.min(100, (Math.abs(row.mtd) / grossMax) * 100);
          const tone = row.mtd >= 0 ? "is-good" : "is-warn";
          return (
            <div key={row.key} className="dash-gross-row">
              <div className="dash-gross-row-label">
                <span>{row.label}</span>
                <div className="dash-gross-row-track">
                  <div
                    className={cn("dash-gross-row-fill", tone)}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
              <span className={cn("dash-gross-row-value", tone)}>
                <SignedMoney value={row.mtd} />
              </span>
              <span className={cn("dash-gross-row-value", row.avg !== null && row.avg >= 0 ? "is-good" : row.avg !== null ? "is-warn" : undefined)}>
                <SignedMoney value={row.avg} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="dash-card-mix">
        {financeLine ? (
          <p className="dash-finance-line">{financeLine}</p>
        ) : (
          <p className="dash-finance-line is-empty">FIN —</p>
        )}
        <p className="dash-mini-label dash-acq-label">Acquisition sources</p>
        {dept.sourceMix.length === 0 ? (
          <p className="dash-tv-empty dash-mix-empty">No booked deals.</p>
        ) : (
          <div className="dash-acq-list">
            {dept.sourceMix.map((s) => (
              <div key={s.name} className="dash-acq-row">
                <span className="dash-acq-name">{s.name}</span>
                <div className="dash-acq-track">
                  <div style={{ width: `${s.width}%` }} />
                </div>
                <span className="dash-acq-value">{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function NeededValue({ n }: { n: NeededDisplay }) {
  if (n.kind === "empty") return <>—</>;
  if (n.kind === "surplus") return <>—{n.units}</>;
  return <>{n.rate.toFixed(1)}</>;
}
