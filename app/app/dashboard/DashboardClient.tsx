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
  isFiDepartment,
} from "@/lib/dashboard/pace";
import {
  isRolledUpDepartment,
  rollupSegmentLabel,
} from "@/lib/departments/rollup";

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
type Department = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
};
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

type MixRow = { name: string; value: string; width: number; count: number };

type DeptSegment = {
  id: string;
  label: string;
  sold: number;
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
  sourceMix: MixRow[];
  financeMix: MixRow[];
  segments: DeptSegment[];
};

type StoreSectionData = {
  id: string;
  name: string;
  sold: number;
  pendingCount: number;
  goal: number | null;
  pace: PaceSnapshot;
  totalGross: number;
  financeMix: MixRow[];
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

const FINANCE_ORDER = ["Prime", "Subprime", "Cash", "Lease"];

function mixRows(
  items: { key: string; count: number }[],
  asPercent: boolean,
  denom: number,
  preferredOrder?: string[]
): MixRow[] {
  const sorted = preferredOrder
    ? [...items].sort((a, b) => {
        const ai = preferredOrder.indexOf(a.key);
        const bi = preferredOrder.indexOf(b.key);
        const ao = ai === -1 ? preferredOrder.length : ai;
        const bo = bi === -1 ? preferredOrder.length : bi;
        return ao - bo || b.count - a.count || a.key.localeCompare(b.key);
      })
    : items;
  const max = Math.max(...sorted.map((i) => i.count), 1);
  return sorted.map((i) => ({
    name: i.key,
    value: asPercent
      ? `${denom > 0 ? Math.round((i.count / denom) * 100) : 0}%`
      : String(i.count),
    width: asPercent
      ? denom > 0
        ? (i.count / denom) * 100
        : 0
      : (i.count / max) * 100,
    count: i.count,
  }));
}

/** Keep top N sources; roll the rest into a trailing "Other" row (always last). */
function topSourcesWithOther(
  items: { key: string; count: number }[],
  limit = 4
): { key: string; count: number }[] {
  if (items.length <= limit) return items;

  const top = items.slice(0, limit);
  const restCount = items
    .slice(limit)
    .reduce((sum, item) => sum + item.count, 0);
  if (restCount <= 0) return top;

  const existingOther = top.findIndex((item) => item.key === "Other");
  if (existingOther >= 0) {
    return top.map((item, index) =>
      index === existingOther
        ? { ...item, count: item.count + restCount }
        : item
    );
  }

  return [...top, { key: "Other", count: restCount }];
}

function dealsListHref(opts: {
  status: string;
  storeId: string;
  departmentId: string;
  year: number;
  month: number;
  rollup?: boolean;
}) {
  const params = new URLSearchParams({
    status: opts.status,
    store: opts.storeId,
    department: opts.departmentId,
    year: String(opts.year),
    month: String(opts.month),
  });
  if (opts.rollup) params.set("rollup", "1");
  return `/app/deals?${params.toString()}`;
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

function SignedMoney({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  return (
    <span className={cn(value >= 0 ? "is-good" : "is-warn")}>
      {fmtCurrency(value)}
    </span>
  );
}

function NeededValue({ n }: { n: NeededDisplay }) {
  if (n.kind === "empty") return <>—</>;
  if (n.kind === "surplus") return <>—{n.units}</>;
  return <>{n.rate.toFixed(1)}</>;
}

function financeToneClass(name: string): string {
  const key = name.trim().toLowerCase();
  if (key === "prime") return "is-prime";
  if (key === "subprime") return "is-subprime";
  if (key === "cash") return "is-cash";
  if (key === "lease") return "is-lease";
  return "is-other";
}

function paceTone(
  projectionVsGoal: number | null
): "good" | "warn" | undefined {
  if (projectionVsGoal === null) return undefined;
  return projectionVsGoal >= 0 ? "good" : "warn";
}

function FinanceMixBar({ rows }: { rows: MixRow[] }) {
  if (rows.length === 0) {
    return <p className="dash-fin-empty">No closed finance mix</p>;
  }
  return (
    <div className="dash-fin">
      <div className="dash-fin-track" aria-hidden>
        {rows.map((row) => (
          <div
            key={row.name}
            className={cn("dash-fin-seg", financeToneClass(row.name))}
            style={{ width: `${Math.max(row.width, row.count > 0 ? 2 : 0)}%` }}
            title={`${row.name} ${row.value}`}
          />
        ))}
      </div>
      <div className="dash-fin-legend">
        {rows.map((row) => (
          <span key={row.name}>
            <i className={cn("dash-fin-swatch", financeToneClass(row.name))} />
            {row.name} {row.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function PaceRingWithPace({
  sold,
  paceValue,
  goal,
  paceLineToday,
  tone,
}: {
  sold: number;
  paceValue: number | null;
  goal: number | null;
  paceLineToday: number | null;
  tone?: "good" | "warn";
}) {
  const size = 124;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct =
    goal !== null && goal > 0 ? Math.min(1, Math.max(0, sold / goal)) : 0;
  const pacePct =
    goal !== null && goal > 0 && paceLineToday !== null
      ? Math.min(1, Math.max(0, paceLineToday / goal))
      : null;
  const dash = pct * c;
  const gap = Math.max(0, c - dash);
  const paceAngle = pacePct !== null ? pacePct * 360 : null;

  return (
    <div
      className={cn(
        "dash-ring",
        tone === "good" && "is-good",
        tone === "warn" && "is-warn",
        !tone && "is-muted"
      )}
    >
      <svg
        className="dash-ring-svg"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          className="dash-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="dash-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${gap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {paceAngle !== null ? (
          <line
            className="dash-ring-pace-tick"
            x1={size / 2}
            y1={stroke / 2 - 1}
            x2={size / 2}
            y2={stroke + 3}
            transform={`rotate(${paceAngle} ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      <div className="dash-ring-center">
        <span className="dash-ring-sold">{sold}</span>
        <span
          className={cn(
            "dash-ring-pace",
            tone === "good" && "is-good",
            tone === "warn" && "is-warn"
          )}
        >
          {paceValue !== null ? paceValue : "—"}
        </span>
        <span className="dash-ring-caption">Sold · Pace</span>
      </div>
    </div>
  );
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
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() =>
    stores.map((s) => s.id)
  );
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setSelectedStoreIds((prev) => {
      const valid = new Set(stores.map((s) => s.id));
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length > 0) return kept;
      return stores.map((s) => s.id);
    });
  }, [stores]);

  const allStoresSelected =
    stores.length > 0 && selectedStoreIds.length === stores.length;
  const showStoreCards =
    !allStoresSelected && selectedStoreIds.length > 0;

  function toggleStore(storeId: string) {
    setSelectedStoreIds((prev) => {
      const allIds = stores.map((s) => s.id);
      const isAll = prev.length === allIds.length;
      if (isAll) {
        // Narrow from all → only this store
        return [storeId];
      }
      if (prev.includes(storeId)) {
        const next = prev.filter((id) => id !== storeId);
        // Never allow empty selection — fall back to all
        return next.length === 0 ? allIds : next;
      }
      const next = [...prev, storeId];
      return next.length === allIds.length ? allIds : next;
    });
  }

  function selectAllStores() {
    setSelectedStoreIds(stores.map((s) => s.id));
  }

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

  const { monthName, workingMeta, deptSections, storeSections } = useMemo(() => {
    const scopedStoreIds =
      selectedStoreIds.length > 0
        ? selectedStoreIds
        : stores.map((s) => s.id);
    const storeById = new Map(stores.map((s) => [s.id, s.name]));

    const mtdDeals = deals.filter((d) => {
      if (!scopedStoreIds.includes(d.store_id)) return false;
      const sm = saleMonth(d.sale_date);
      return sm.year === year && sm.month === month;
    });

    const scopedDepts = departments.filter(
      (d) => scopedStoreIds.includes(d.store_id) && !isFiDepartment(d.name)
    );
    const parentDepts = scopedDepts
      .filter((d) => !isRolledUpDepartment(d))
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
      scopedStoreIds
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

    const fiDeptIds = new Set(
      departments.filter((d) => isFiDepartment(d.name)).map((d) => d.id)
    );

    const deptSections: DeptSectionData[] = parentDepts.map((dept) => {
      const children = scopedDepts
        .filter((d) => d.rolls_up_to_department_id === dept.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const memberIds = new Set([dept.id, ...children.map((c) => c.id)]);
      const deptWorkingDays = computeWorkingDays(year, month, calendarDays, [
        dept.store_id,
      ]);
      const booked = mtdDeals.filter(
        (d) => memberIds.has(d.department_id) && isBooked(d.status)
      );
      const closed = mtdDeals.filter(
        (d) => memberIds.has(d.department_id) && isClosed(d.status)
      );
      const pendingCount = mtdDeals.filter(
        (d) => memberIds.has(d.department_id) && d.status === "pending"
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
        scopedStoreIds.length > 1
          ? `${shortStoreLabel(storeName)} · ${dept.name}`
          : dept.name;

      const segments: DeptSegment[] =
        children.length === 0
          ? []
          : [
              {
                id: dept.id,
                label: rollupSegmentLabel(dept),
                sold: booked.filter((d) => d.department_id === dept.id).length,
              },
              ...children.map((child) => ({
                id: child.id,
                label: rollupSegmentLabel(child),
                sold: booked.filter((d) => d.department_id === child.id)
                  .length,
              })),
            ];

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
        sourceMix: mixRows(
          topSourcesWithOther(sourceCounts, 4),
          false,
          booked.length
        ),
        financeMix: mixRows(financeCounts, true, closedCount, FINANCE_ORDER),
        segments,
      };
    });

    const storeSections: StoreSectionData[] = scopedStoreIds
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

        const storeClosed = mtdDeals.filter(
          (d) =>
            d.store_id === storeId &&
            isClosed(d.status) &&
            !fiDeptIds.has(d.department_id)
        );
        const financeCounts = countBy(storeClosed, (d) =>
          financeLabel(d.finance_type)
        );

        return {
          id: storeId,
          name: storeName,
          sold,
          pendingCount,
          goal,
          pace,
          totalGross,
          financeMix: mixRows(
            financeCounts,
            true,
            storeClosed.length,
            FINANCE_ORDER
          ),
        };
      })
      .filter((s): s is StoreSectionData => s !== null);

    return {
      monthName: MONTH_NAMES[month - 1],
      workingMeta: samplePace,
      deptSections,
      storeSections,
    };
  }, [
    selectedStoreIds,
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
    <div className={cn("pc-command dash-tv dash-v2 space-y-5")}>
      <header className="pc-head dash-tv-head dash-v2-head">
        <div className="dash-v2-head-main">
          <p className="pc-kicker dash-v2-kicker">
            <span className="dash-v2-kicker-muted">Dealer Command</span>
            <span className="dash-v2-kicker-sep" aria-hidden>
              ›
            </span>
            <span>Sales Command</span>
          </p>
          <h1 className="pc-title dash-v2-title">
            {monthName} <span className="dash-v2-year">{year}</span>
          </h1>
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
        </div>

        <div className="dash-tv-controls dash-v2-controls">
          {stores.length > 0 && (
            <div className="pc-store-pills" role="group" aria-label="Store">
              <button
                type="button"
                className={cn("pc-pill", allStoresSelected && "is-active")}
                onClick={selectAllStores}
              >
                All stores
              </button>
              {stores.map((store) => {
                const isOn =
                  selectedStoreIds.includes(store.id) && !allStoresSelected;
                return (
                  <button
                    key={store.id}
                    type="button"
                    className={cn("pc-pill", isOn && "is-active")}
                    aria-pressed={isOn || allStoresSelected}
                    onClick={() => toggleStore(store.id)}
                  >
                    {shortStoreLabel(store.name)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="dash-tv-selects">
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
      </header>

      {deptSections.length === 0 ? (
        <div className="pc-panel">
          <p className="dash-tv-empty">
            No departments configured for this view.
          </p>
        </div>
      ) : (
        <>
          {showStoreCards && storeSections.length > 0 ? (
            <section
              className="dash-store-grid"
              aria-label="Store totals"
            >
              {storeSections.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </section>
          ) : null}

          <div className="dash-dept-stack">
            {deptSections.map((dept) => (
              <DepartmentRow
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

function StoreCard({ store }: { store: StoreSectionData }) {
  const { pace, goal, sold } = store;
  const hasGoal = goal !== null && goal > 0;
  const tone = paceTone(pace.projectionVsGoal);

  return (
    <article className="dash-store-card">
      <PaceRingWithPace
        sold={sold}
        paceValue={pace.monthEndProjection}
        goal={goal}
        paceLineToday={pace.paceLineToday}
        tone={tone}
      />

      <div className="dash-store-card-body">
        <h2 className="dash-store-card-name">{store.name}</h2>

        <div className="dash-metric-row dash-metric-row-store">
          <div className="dash-metric">
            <span className="dash-metric-label">Sold MTD</span>
            <span className="dash-metric-value">{sold}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Pace</span>
            <span
              className={cn(
                "dash-metric-value",
                tone === "good" && "is-good",
                tone === "warn" && "is-warn"
              )}
            >
              {pace.monthEndProjection !== null ? pace.monthEndProjection : "—"}
            </span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Goal</span>
            <span className="dash-metric-value">
              {hasGoal ? goal : "—"}
            </span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Need / Day</span>
            <span className="dash-metric-value is-blue">
              <NeededValue n={pace.needed} />
            </span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Total Gross</span>
            <span
              className={cn(
                "dash-metric-value dash-metric-value-money",
                store.totalGross >= 0 ? "is-good" : "is-warn"
              )}
            >
              {fmtCurrency(store.totalGross)}
            </span>
          </div>
        </div>

        <FinanceMixBar rows={store.financeMix} />
      </div>
    </article>
  );
}

function DepartmentRow({
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
  const tone = paceTone(pace.projectionVsGoal);

  const grossMax = Math.max(
    Math.abs(dept.totalGross),
    Math.abs(dept.front),
    Math.abs(dept.back),
    1
  );

  const includeRollup = dept.segments.length > 0;
  const viewAllHref = dealsListHref({
    status: "all",
    storeId: dept.storeId,
    departmentId: dept.id,
    year,
    month,
    rollup: includeRollup,
  });

  const awaitingHref =
    dept.pendingCount > 0
      ? dealsListHref({
          status: "pending",
          storeId: dept.storeId,
          departmentId: dept.id,
          year,
          month,
          rollup: includeRollup,
        })
      : null;

  return (
    <section className="dash-dept-row">
      <div className="dash-dept-identity">
        <PaceRingWithPace
          sold={sold}
          paceValue={pace.monthEndProjection}
          goal={goal}
          paceLineToday={pace.paceLineToday}
          tone={tone}
        />
        <div className="dash-dept-identity-copy">
          <h2 className="dash-dept-title">{dept.title}</h2>
          {dept.segments.length > 0 ? (
            <p className="dash-channel-split">
              {dept.segments.map((seg, i) => (
                <span key={seg.id}>
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <Link
                    href={dealsListHref({
                      status: "all",
                      storeId: dept.storeId,
                      departmentId: seg.id,
                      year,
                      month,
                    })}
                    className="dash-channel-link"
                    prefetch
                  >
                    {seg.label} {seg.sold}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <div className="dash-dept-actions">
            {awaitingHref != null ? (
              <Link href={awaitingHref} className="dash-awaiting" prefetch>
                {dept.pendingCount} Awaiting Delivery
              </Link>
            ) : null}
            <Link href={viewAllHref} className="dash-view-deals" prefetch>
              View all deals →
            </Link>
            {!hasGoal && !viewOnly ? (
              <Link
                href={`/app/setup?year=${year}&month=${month}#goals`}
                className="pc-pill is-active dash-set-goal"
              >
                Set Goal
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="dash-dept-volume">
        <div className="dash-metric-row dash-metric-row-2x2">
          <div className="dash-metric">
            <span className="dash-metric-label">Sold MTD</span>
            <span className="dash-metric-value">{sold}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Pace</span>
            <span
              className={cn(
                "dash-metric-value",
                tone === "good" && "is-good",
                tone === "warn" && "is-warn"
              )}
            >
              {pace.monthEndProjection !== null
                ? pace.monthEndProjection
                : "—"}
            </span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Goal</span>
            <span className="dash-metric-value">
              {hasGoal ? goal : "—"}
            </span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Need / Day</span>
            <span className="dash-metric-value is-blue">
              <NeededValue n={pace.needed} />
            </span>
          </div>
        </div>
        <FinanceMixBar rows={dept.financeMix} />
        {!hasGoal ? (
          <p className="dash-store-no-goal">{sold} sold MTD · no volume goal</p>
        ) : null}
      </div>

      <div className="dash-card-gross dash-dept-gross">
        <div className="dash-gross-table-head">
          <span className="dash-mini-label">Gross</span>
          <span className="dash-mini-label">MTD</span>
          <span className="dash-mini-label">Avg</span>
        </div>
        {(
          [
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
            {
              key: "total",
              label: "Total",
              mtd: dept.totalGross,
              avg: dept.avgTotal,
            },
          ] as const
        ).map((row) => {
          const barPct = Math.min(50, (Math.abs(row.mtd) / grossMax) * 50);
          const toneClass = row.mtd >= 0 ? "is-good" : "is-warn";
          const sideClass = row.mtd >= 0 ? "is-pos" : "is-neg";
          return (
            <div key={row.key} className="dash-gross-row">
              <div className="dash-gross-row-label">
                <span>{row.label}</span>
                <div className="dash-gross-row-track is-diverging">
                  <div className="dash-gross-mid" aria-hidden />
                  <div
                    className={cn("dash-gross-row-fill", toneClass, sideClass)}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
              <span className={cn("dash-gross-row-value", toneClass)}>
                <SignedMoney value={row.mtd} />
              </span>
              <span
                className={cn(
                  "dash-gross-row-value",
                  row.avg !== null && row.avg >= 0
                    ? "is-good"
                    : row.avg !== null
                      ? "is-warn"
                      : undefined
                )}
              >
                <SignedMoney value={row.avg} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="dash-dept-acq">
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
