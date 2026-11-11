"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import {
  MONTH_NAMES,
  computePaceSnapshot,
  computeWorkingDays,
  fmtUnits,
  type CalendarDay,
} from "@/lib/dashboard/pace";

type Store = { id: string; name: string };
type Department = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  store_id: string;
  department_id: string;
  sale_date: string;
};
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

type DeptBucket = "chevy" | "cdjr" | "preowned";

type Props = {
  stores: Store[];
  deals: Deal[];
  departments: Department[];
  salespeople: Salesperson[];
  dealSalespeople: DealSalesperson[];
  calendarDays: CalendarDay[];
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

function saleMonth(saleDate: string): { year: number; month: number } {
  const d = saleDate.slice(0, 10);
  return {
    year: parseInt(d.slice(0, 4), 10),
    month: parseInt(d.slice(5, 7), 10),
  };
}

function fmtPace(pace: number | null): string {
  return pace !== null ? String(pace) : "—";
}

/** New Chevy and New CDJR include their fleet desks. Anything else stays in the totals only. */
function departmentBucket(name: string): DeptBucket | null {
  if (isPreOwnedDepartment(name)) return "preowned";
  const n = name.trim().toLowerCase();
  if (/\b(chevy|chevrolet)\b/.test(n)) return "chevy";
  if (/\bcdjr\b/.test(n)) return "cdjr";
  return null;
}

type SortKey =
  | "rank"
  | "name"
  | "store"
  | "chevy"
  | "cdjr"
  | "preowned"
  | "mtd"
  | "pace"
  | "ytd";

const SORT_LABEL: Record<SortKey, string> = {
  rank: "rank",
  name: "salesperson",
  store: "store",
  chevy: "New Chevy",
  cdjr: "New CDJR",
  preowned: "Pre-Owned",
  mtd: "MTD total",
  pace: "pace",
  ytd: "YTD units",
};

function defaultSortDir(key: SortKey): "asc" | "desc" {
  return key === "name" || key === "store" || key === "rank" ? "asc" : "desc";
}

function SortTh({
  k,
  label,
  sortKey,
  sortDir,
  onSort,
  right,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th
      className={right ? "r" : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="da-demo-sort" onClick={() => onSort(k)}>
        {label}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

export default function LeaderboardClient({
  stores,
  deals,
  departments,
  salespeople,
  dealSalespeople,
  calendarDays,
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
  const [sortKey, setSortKey] = useState<SortKey>("mtd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
    router.push(
      q ? `/app/salesperson-leaderboard?${q}` : "/app/salesperson-leaderboard"
    );
  }

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);
    if (!years.includes(year)) years.push(year);
    return years.sort((a, b) => b - a);
  }, [currentYear, year]);

  const { monthLabel, leaderboard, showStoreCol } = useMemo(() => {
    const selectedStoreIds =
      selectedStore === "all" ? stores.map((s) => s.id) : [selectedStore];
    const showStoreCol = selectedStore === "all" && stores.length > 1;
    const storeById = new Map(stores.map((s) => [s.id, s.name]));
    const workingDaysByStore = new Map<string, string[]>();

    function workingDaysForStore(storeId: string): string[] {
      let days = workingDaysByStore.get(storeId);
      if (!days) {
        days = computeWorkingDays(year, month, calendarDays, [storeId]);
        workingDaysByStore.set(storeId, days);
      }
      return days;
    }

    const mtdDeals = deals.filter((d) => {
      if (!selectedStoreIds.includes(d.store_id)) return false;
      const sm = saleMonth(d.sale_date);
      return sm.year === year && sm.month === month;
    });
    const ytdDeals = deals.filter((d) =>
      selectedStoreIds.includes(d.store_id)
    );

    const mtdDealMap = new Map(mtdDeals.map((d) => [d.id, d]));
    const ytdDealMap = new Map(ytdDeals.map((d) => [d.id, d]));
    const bucketByDept = new Map(
      departments.map((d) => [d.id, departmentBucket(d.name)] as const)
    );
    const spAcc = new Map<
      string,
      {
        chevy: number;
        cdjr: number;
        preowned: number;
        mtdUnits: number;
        ytdUnits: number;
      }
    >();

    for (const ds of dealSalespeople) {
      const share = (ds.share_percent ?? 0) / 100;
      if (share <= 0) continue;

      const mtdDeal = mtdDealMap.get(ds.deal_id);
      const ytdDeal = ytdDealMap.get(ds.deal_id);
      if (!mtdDeal && !ytdDeal) continue;

      const acc = spAcc.get(ds.salesperson_id) ?? {
        chevy: 0,
        cdjr: 0,
        preowned: 0,
        mtdUnits: 0,
        ytdUnits: 0,
      };

      if (ytdDeal && isBooked(ytdDeal.status)) {
        acc.ytdUnits += share;
      }
      if (mtdDeal && isBooked(mtdDeal.status)) {
        acc.mtdUnits += share;
        const bucket = bucketByDept.get(mtdDeal.department_id);
        if (bucket) acc[bucket] += share;
      }
      spAcc.set(ds.salesperson_id, acc);
    }

    const spById = new Map(salespeople.map((sp) => [sp.id, sp]));
    const leaderboard = Array.from(spAcc.entries())
      .map(([spId, acc]) => {
        const sp = spById.get(spId);
        const storeId = sp?.store_id ?? "";
        const pace = storeId
          ? computePaceSnapshot(
              acc.mtdUnits,
              null,
              year,
              month,
              workingDaysForStore(storeId),
              isCurrentMonth,
              isFutureMonth
            ).monthEndProjection
          : null;
        return {
          id: spId,
          name: sp?.name ?? "Unknown",
          storeName: storeById.get(storeId) ?? "",
          chevy: acc.chevy,
          cdjr: acc.cdjr,
          preowned: acc.preowned,
          mtdUnits: acc.mtdUnits,
          pace,
          ytdUnits: acc.ytdUnits,
        };
      })
      .filter((r) => r.mtdUnits > 0)
      .sort(
        (a, b) =>
          b.mtdUnits - a.mtdUnits || a.name.localeCompare(b.name)
      );

    return {
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      leaderboard,
      showStoreCol,
    };
  }, [
    selectedStore,
    stores,
    deals,
    departments,
    salespeople,
    dealSalespeople,
    calendarDays,
    year,
    month,
    isCurrentMonth,
    isFutureMonth,
  ]);

  const rows = useMemo(() => {
    const ranked = leaderboard.map((row, i) => ({ ...row, rank: i + 1 }));
    const key = sortKey === "store" && !showStoreCol ? "mtd" : sortKey;
    const dir = sortKey === "store" && !showStoreCol ? "desc" : sortDir;
    const mul = dir === "asc" ? 1 : -1;
    ranked.sort((a, b) => {
      let cmp = 0;
      if (key === "name" || key === "store") {
        const av = key === "name" ? a.name : a.storeName;
        const bv = key === "name" ? b.name : b.storeName;
        cmp = av.localeCompare(bv) * mul;
      } else if (key === "pace") {
        if (a.pace == null && b.pace == null) cmp = 0;
        else if (a.pace == null) cmp = 1;
        else if (b.pace == null) cmp = -1;
        else cmp = (a.pace - b.pace) * mul;
      } else {
        const av =
          key === "rank"
            ? a.rank
            : key === "mtd"
              ? a.mtdUnits
              : key === "ytd"
                ? a.ytdUnits
                : a[key];
        const bv =
          key === "rank"
            ? b.rank
            : key === "mtd"
              ? b.mtdUnits
              : key === "ytd"
                ? b.ytdUnits
                : b[key];
        cmp = (av - bv) * mul;
      }
      return cmp || a.name.localeCompare(b.name);
    });
    return ranked;
  }, [leaderboard, showStoreCol, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultSortDir(key));
  }

  const activeSortKey = sortKey === "store" && !showStoreCol ? "mtd" : sortKey;
  const activeSortDir =
    sortKey === "store" && !showStoreCol ? "desc" : sortDir;

  const top3 = leaderboard.slice(0, 3);
  const updatedLabel = updatedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={cn("pc-command dash-tv space-y-5")}>
      <header className="pc-head dash-tv-head">
        <div>
          <p className="pc-kicker">Sales leaderboard</p>
          <h1 className="pc-title">{monthLabel}</h1>
          <p className="pc-meta">
            Combined volume across all departments · Live · refreshed{" "}
            {updatedLabel}
          </p>
        </div>

        <div className="dash-tv-controls">
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

      <section className="da-demo-podium dash-tv-podium">
        <div className="da-demo-section-title">
          <span className="da-sec-eyebrow">Sales leaderboard</span>
          <h2>Who&apos;s leading the board this month</h2>
          <p>
            Top names stay visible for the whole store — MTD units, pace, and
            YTD units.
          </p>
        </div>

        {top3.length > 0 ? (
          <div className="da-demo-podium-grid">
            {top3.map((p, idx) => (
              <div
                key={p.id}
                className={`da-demo-podium-card rank-${idx + 1}`}
              >
                <div className="da-demo-rank">#{idx + 1}</div>
                <div className="da-demo-podium-name">{p.name}</div>
                <div className="da-demo-podium-store">
                  {p.storeName || "—"}
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtUnits(p.mtdUnits)}</b>
                  <span>MTD units</span>
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtPace(p.pace)}</b>
                  <span>Pace</span>
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtUnits(p.ytdUnits)}</b>
                  <span>YTD units</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pc-panel">
            <p className="dash-tv-empty">No salesperson volume this month.</p>
          </div>
        )}
      </section>

      <div className="da-demo-panel">
        <div className="da-demo-panel-head">
          <h3>Full salesperson leaderboard</h3>
          <span>
            Sorted by {SORT_LABEL[activeSortKey]}{" "}
            {activeSortDir === "asc" ? "↑" : "↓"}
          </span>
        </div>
        <div className="da-demo-table-scroll">
          <table className="da-demo-table">
            <thead>
              <tr>
                <SortTh
                  k="rank"
                  label="Rank"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  k="name"
                  label="Salesperson"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                />
                {showStoreCol && (
                  <SortTh
                    k="store"
                    label="Store"
                    sortKey={activeSortKey}
                    sortDir={activeSortDir}
                    onSort={toggleSort}
                  />
                )}
                <SortTh
                  k="chevy"
                  label="New Chevy"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
                <SortTh
                  k="cdjr"
                  label="New CDJR"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
                <SortTh
                  k="preowned"
                  label="Pre-Owned"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
                <SortTh
                  k="mtd"
                  label="MTD Total"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
                <SortTh
                  k="pace"
                  label="Pace"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
                <SortTh
                  k="ytd"
                  label="YTD Units"
                  sortKey={activeSortKey}
                  sortDir={activeSortDir}
                  onSort={toggleSort}
                  right
                />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showStoreCol ? 9 : 8}
                    className="dash-tv-empty-cell"
                  >
                    No deals logged for this view.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={row.rank <= 3 ? "is-hot" : undefined}>
                    <td>
                      <span
                        className={`da-demo-rank-pill${row.rank <= 3 ? " top" : ""}`}
                      >
                        #{row.rank}
                      </span>
                    </td>
                    <td className="strong">{row.name}</td>
                    {showStoreCol && <td>{row.storeName}</td>}
                    <td className="r">{fmtUnits(row.chevy)}</td>
                    <td className="r">{fmtUnits(row.cdjr)}</td>
                    <td className="r">{fmtUnits(row.preowned)}</td>
                    <td className="r strong">{fmtUnits(row.mtdUnits)}</td>
                    <td className="r">{fmtPace(row.pace)}</td>
                    <td className="r">{fmtUnits(row.ytdUnits)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="dash-tv-footnote">
          New Chevy, New CDJR, and Pre-Owned are MTD units. Chevrolet Fleet
          counts with New Chevy and CDJR Fleet counts with New CDJR. MTD
          Total, pace, and YTD include every booked department. Units include
          pending, delivered, and closed. Pace is the month-end projection
          from calendar working days (same as dashboard).
        </p>
      </div>
    </div>
  );
}
