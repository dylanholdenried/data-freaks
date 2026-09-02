"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import {
  byDepartment,
  bySalesperson,
  enrichTrades,
  exitBucketLabel,
  exitMixSeries,
  filterByStore,
  formatDisplayDate,
  monthlySeries,
  summarizeRange,
} from "@/lib/trades/aggregate";
import type {
  TradeDeal,
  TradeDealSalesperson,
  TradeRow,
} from "@/lib/trades/types";
import { loadTradesRange } from "./actions";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };
type Salesperson = { id: string; name: string; store_id: string };

type Props = {
  stores: Store[];
  departments: Department[];
  salespeople: Salesperson[];
  deals: TradeDeal[];
  trades: TradeRow[];
  dealSalespeople: TradeDealSalesperson[];
  groupName: string;
  preset: DatePreset;
  range: DateRange;
  initialStoreId?: string;
  initialYear: number;
  initialMonth: number;
};

const PILL_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "mtd", label: "MTD" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
  { value: "all_time", label: "All time" },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EXIT_COLORS: Record<string, string> = {
  retail: "#3d8bfd",
  wholesale: "#34d399",
  unknown: "#94a3b8",
};

const fmt$ = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtN = (v: number | null, digits = 0) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const fmtPct = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(0)}%`;
};

function storePillLabel(name: string) {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return jb[1]!.trim().toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!.toUpperCase();
  return n.toUpperCase();
}

type DeptSortKey =
  | "label"
  | "tradeCount"
  | "attachPct"
  | "totalAcv"
  | "totalAllowance"
  | "netHold"
  | "avgHold"
  | "retailCount"
  | "wholesaleCount"
  | "unknownCount";

type TradeSortKey =
  | "sale_date"
  | "vehicle"
  | "exit"
  | "acv"
  | "allowance"
  | "hold"
  | "departmentName"
  | "storeName"
  | "deal";

function sortMarker(
  activeKey: string,
  key: string,
  dir: "asc" | "desc"
): string {
  if (activeKey !== key) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: "asc" | "desc"
): number {
  const an = a == null || !Number.isFinite(a) ? null : a;
  const bn = b == null || !Number.isFinite(b) ? null : b;
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  return dir === "asc" ? an - bn : bn - an;
}

function compareString(a: string, b: string, dir: "asc" | "desc"): number {
  const c = a.localeCompare(b);
  return dir === "asc" ? c : -c;
}

function tradesHref(opts: {
  preset: DatePreset;
  storeId: string;
  year: number;
  month: number;
}) {
  const params = new URLSearchParams();
  if (opts.preset !== "mtd") params.set("preset", opts.preset);
  if (opts.storeId !== "all") params.set("store", opts.storeId);
  if (opts.preset === "month") {
    params.set("year", String(opts.year));
    params.set("month", String(opts.month));
  }
  const q = params.toString();
  return q ? `/app/trades?${q}` : "/app/trades";
}

type CachedEntry = {
  range: DateRange;
  deals: TradeDeal[];
  trades: TradeRow[];
  dealSalespeople: TradeDealSalesperson[];
};

function cacheKey(preset: DatePreset, year: number, month: number) {
  return preset === "month" ? `month:${year}-${month}` : preset;
}

export default function TradesClient({
  stores,
  departments,
  salespeople,
  deals: initialDeals,
  trades: initialTrades,
  dealSalespeople: initialDealSalespeople,
  groupName,
  preset: initialPreset,
  range: initialRange,
  initialStoreId = "all",
  initialYear,
  initialMonth,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [storeId, setStoreId] = useState(() =>
    initialStoreId !== "all" && stores.some((s) => s.id === initialStoreId)
      ? initialStoreId
      : "all"
  );
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [deals, setDeals] = useState<TradeDeal[]>(initialDeals);
  const [trades, setTrades] = useState<TradeRow[]>(initialTrades);
  const [dealSalespeople, setDealSalespeople] = useState<
    TradeDealSalesperson[]
  >(initialDealSalespeople);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [deptSortKey, setDeptSortKey] = useState<DeptSortKey>("tradeCount");
  const [deptSortDir, setDeptSortDir] = useState<"asc" | "desc">("desc");
  const [tradeSortKey, setTradeSortKey] = useState<TradeSortKey>("sale_date");
  const [tradeSortDir, setTradeSortDir] = useState<"asc" | "desc">("desc");

  const multiStoreView = stores.length > 1 && storeId === "all";

  const cacheRef = useRef<Map<string, CachedEntry>>(
    new Map([
      [
        cacheKey(initialPreset, initialYear, initialMonth),
        {
          deals: initialDeals,
          trades: initialTrades,
          dealSalespeople: initialDealSalespeople,
          range: initialRange,
        },
      ],
    ])
  );
  const inflightRef = useRef<
    Map<string, Promise<CachedEntry & { preset: DatePreset }>>
  >(new Map());

  const applyBundle = useCallback(
    (
      nextPreset: DatePreset,
      nextRange: DateRange,
      nextDeals: TradeDeal[],
      nextTrades: TradeRow[],
      nextDealSalespeople: TradeDealSalesperson[],
      nextYear: number,
      nextMonth: number
    ) => {
      setPreset(nextPreset);
      setRange(nextRange);
      setDeals(nextDeals);
      setTrades(nextTrades);
      setDealSalespeople(nextDealSalespeople);
      setYear(nextYear);
      setMonth(nextMonth);
      cacheRef.current.set(cacheKey(nextPreset, nextYear, nextMonth), {
        deals: nextDeals,
        trades: nextTrades,
        dealSalespeople: nextDealSalespeople,
        range: nextRange,
      });
    },
    []
  );

  useEffect(() => {
    const href = tradesHref({ preset, storeId, year, month });
    const next = href.replace("/app/trades", pathname);
    const current = `${pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }, [preset, storeId, year, month, pathname, router]);

  async function navigateDate(
    nextPreset: DatePreset,
    opts?: { year?: number; month?: number }
  ) {
    const nextYear = opts?.year ?? year;
    const nextMonth = opts?.month ?? month;
    const key = cacheKey(nextPreset, nextYear, nextMonth);
    setDateError(null);

    const cached = cacheRef.current.get(key);
    if (cached) {
      applyBundle(
        nextPreset,
        cached.range,
        cached.deals,
        cached.trades,
        cached.dealSalespeople,
        nextYear,
        nextMonth
      );
      return;
    }

    setDateLoading(true);
    try {
      let inflight = inflightRef.current.get(key);
      if (!inflight) {
        inflight = loadTradesRange({
          presetRaw: nextPreset,
          year: nextPreset === "month" ? nextYear : undefined,
          month: nextPreset === "month" ? nextMonth : undefined,
        }).then((res) => {
          if (!res.ok) throw new Error(res.error);
          return {
            preset: res.preset,
            range: res.range,
            deals: res.deals,
            trades: res.trades,
            dealSalespeople: res.dealSalespeople,
          };
        });
        inflightRef.current.set(key, inflight);
      }
      const result = await inflight;
      applyBundle(
        nextPreset,
        result.range,
        result.deals,
        result.trades,
        result.dealSalespeople,
        nextYear,
        nextMonth
      );
    } catch (e) {
      setDateError(e instanceof Error ? e.message : "Failed to load range.");
    } finally {
      inflightRef.current.delete(key);
      setDateLoading(false);
    }
  }

  const scopedDeals = useMemo(
    () => filterByStore(deals, storeId),
    [deals, storeId]
  );
  const scopedDealIds = useMemo(
    () => new Set(scopedDeals.map((d) => d.id)),
    [scopedDeals]
  );
  const scopedTrades = useMemo(
    () => trades.filter((t) => scopedDealIds.has(t.deal_id)),
    [trades, scopedDealIds]
  );
  const scopedDealSalespeople = useMemo(
    () => dealSalespeople.filter((s) => scopedDealIds.has(s.deal_id)),
    [dealSalespeople, scopedDealIds]
  );

  const summary = useMemo(
    () => summarizeRange(scopedDeals, scopedTrades),
    [scopedDeals, scopedTrades]
  );

  const deptRows = useMemo(
    () => byDepartment(scopedDeals, scopedTrades, departments, stores),
    [scopedDeals, scopedTrades, departments, stores]
  );

  const sortedDeptRows = useMemo(() => {
    const copy = [...deptRows];
    copy.sort((a, b) => {
      if (deptSortKey === "label") {
        const labelA =
          multiStoreView && a.storeName
            ? `${a.label} (${a.storeName})`
            : a.label;
        const labelB =
          multiStoreView && b.storeName
            ? `${b.label} (${b.storeName})`
            : b.label;
        return compareString(labelA, labelB, deptSortDir);
      }
      return compareNullableNumber(a[deptSortKey], b[deptSortKey], deptSortDir);
    });
    return copy;
  }, [deptRows, deptSortKey, deptSortDir, multiStoreView]);

  function toggleDeptSort(key: DeptSortKey) {
    if (deptSortKey === key) {
      setDeptSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDeptSortKey(key);
      setDeptSortDir(key === "label" ? "asc" : "desc");
    }
  }

  const salespersonRows = useMemo(
    () =>
      bySalesperson(
        scopedTrades,
        scopedDealSalespeople,
        salespeople,
        stores
      ),
    [scopedTrades, scopedDealSalespeople, salespeople, stores]
  );

  const monthly = useMemo(
    () => monthlySeries(scopedDeals, scopedTrades, range),
    [scopedDeals, scopedTrades, range]
  );

  const exitMix = useMemo(() => exitMixSeries(scopedTrades), [scopedTrades]);

  const enriched = useMemo(
    () => enrichTrades(scopedDeals, scopedTrades, departments, stores),
    [scopedDeals, scopedTrades, departments, stores]
  );

  const sortedTrades = useMemo(() => {
    const copy = [...enriched];
    copy.sort((a, b) => {
      switch (tradeSortKey) {
        case "sale_date":
          return compareString(a.sale_date, b.sale_date, tradeSortDir);
        case "vehicle": {
          const va = [a.year, a.make, a.model]
            .filter((x) => x != null && x !== "")
            .join(" ");
          const vb = [b.year, b.make, b.model]
            .filter((x) => x != null && x !== "")
            .join(" ");
          return compareString(va, vb, tradeSortDir);
        }
        case "exit":
          return compareString(
            exitBucketLabel(a.exit),
            exitBucketLabel(b.exit),
            tradeSortDir
          );
        case "acv":
          return compareNullableNumber(a.acv, b.acv, tradeSortDir);
        case "allowance":
          return compareNullableNumber(a.allowance, b.allowance, tradeSortDir);
        case "hold":
          return compareNullableNumber(a.hold, b.hold, tradeSortDir);
        case "departmentName":
          return compareString(
            a.departmentName,
            b.departmentName,
            tradeSortDir
          );
        case "storeName":
          return compareString(a.storeName, b.storeName, tradeSortDir);
        case "deal":
          return compareString(a.deal_id, b.deal_id, tradeSortDir);
        default:
          return 0;
      }
    });
    return copy;
  }, [enriched, tradeSortKey, tradeSortDir]);

  function toggleTradeSort(key: TradeSortKey) {
    if (tradeSortKey === key) {
      setTradeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTradeSortKey(key);
      setTradeSortDir(
        key === "sale_date" ||
          key === "vehicle" ||
          key === "exit" ||
          key === "departmentName" ||
          key === "storeName" ||
          key === "deal"
          ? "asc"
          : "desc"
      );
    }
  }

  const salespersonHoldMax = useMemo(() => {
    let max = 0;
    for (const row of salespersonRows) {
      if (row.avgHold == null) continue;
      max = Math.max(max, Math.abs(row.avgHold));
    }
    return max;
  }, [salespersonRows]);

  const unknownShare =
    summary.tradeCount > 0 ? summary.unknownCount / summary.tradeCount : 0;


  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    const years: number[] = [];
    for (let y = nowY; y >= nowY - 10; y -= 1) years.push(y);
    return years;
  }, []);

  const rangeLabel =
    preset === "month"
      ? `${MONTH_NAMES[month - 1] ?? month} ${year}`
      : `${formatDisplayDate(range.from)} → ${formatDisplayDate(range.to)}`;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Analyze</p>
          <h1 className="pc-title">Trades</h1>
          <p className="pc-meta">
            {groupName ? `${groupName} · ` : ""}
            {rangeLabel}
            {dateLoading ? " · Loading…" : ""}
          </p>
        </div>
        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Store">
            <button
              type="button"
              className={cn("pc-pill", storeId === "all" && "is-active")}
              onClick={() => setStoreId("all")}
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn("pc-pill", storeId === s.id && "is-active")}
                onClick={() => setStoreId(s.id)}
              >
                {storePillLabel(s.name)}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">
          Date range
          {dateLoading ? " · Loading…" : ""}
        </p>
        <div
          className={cn("pc-pill-row", dateLoading && "is-loading")}
          aria-busy={dateLoading}
        >
          {PILL_PRESETS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={dateLoading}
              onClick={() => void navigateDate(opt.value)}
              className={cn(
                "pc-pill is-soft",
                preset === opt.value && "is-active"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="dash-tv-selects" style={{ marginTop: "1rem" }}>
          <label>
            <span>Month</span>
            <select
              disabled={dateLoading}
              value={month}
              aria-label="Month"
              onChange={(e) => {
                const nextMonth = Number(e.target.value);
                void navigateDate("month", { year, month: nextMonth });
              }}
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
              disabled={dateLoading}
              value={year}
              aria-label="Year"
              onChange={(e) => {
                const nextYear = Number(e.target.value);
                void navigateDate("month", { year: nextYear, month });
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {preset === "month" ? (
            <span className="pc-pill is-soft is-active" aria-current="true">
              {MONTH_NAMES[month - 1]} {year}
            </span>
          ) : null}
        </div>
        {dateError ? (
          <p className="pc-meta" role="alert" style={{ marginTop: "0.5rem" }}>
            {dateError}
          </p>
        ) : null}
      </section>

      <div className="pc-kpi-grid trades-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade count</div>
          <div className="pc-kpi-value amber">{fmtN(summary.tradeCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade %</div>
          <div className="pc-kpi-value">{fmtPct(summary.attachPct)}</div>
          <div className="pc-kpi-sub">
            of {fmtN(summary.dealCount)} closed deals
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Retail trades</div>
          <div className="pc-kpi-value">{fmtN(summary.retailCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Wholesale trades</div>
          <div className="pc-kpi-value">{fmtN(summary.wholesaleCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Unknown exit</div>
          <div className="pc-kpi-value">{fmtN(summary.unknownCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total ACV</div>
          <div className="pc-kpi-value">{fmt$(summary.totalAcv)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total allowance</div>
          <div className="pc-kpi-value">{fmt$(summary.totalAllowance)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Net hold</div>
          <div
            className={cn(
              "pc-kpi-value",
              summary.netHold != null && summary.netHold < 0 ? "red" : "green"
            )}
          >
            {fmt$(summary.netHold)}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg hold</div>
          <div
            className={cn(
              "pc-kpi-value",
              summary.avgHold != null && summary.avgHold < 0 ? "red" : "green"
            )}
          >
            {fmt$(summary.avgHold)}
          </div>
          <div className="pc-kpi-sub">per trade vehicle</div>
        </div>
      </div>

      {unknownShare >= 0.5 && summary.tradeCount > 0 ? (
        <p className="pc-meta" style={{ marginTop: "0.25rem" }}>
          {fmtPct(unknownShare * 100)} of trades have no exit strategy set.
          Filling Retail / Wholesale on deals will tighten this mix.
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        <section className="pc-chart">
          <div className="pc-chart-head">
            <h3>Trades over time</h3>
            <p>By sale month</p>
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart
                data={monthly}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.2)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid #334155",
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="tradeCount"
                  name="Trades"
                  fill="#3d8bfd"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="pc-chart">
          <div className="pc-chart-head">
            <h3>Exit strategy</h3>
            <p>Retail / wholesale / unknown</p>
          </div>
          <div style={{ width: "100%", height: 220 }}>
            {summary.tradeCount === 0 ? (
              <p className="pc-meta">No trades in this range.</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={exitMix}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {exitMix.map((entry) => (
                      <Cell
                        key={entry.bucket}
                        fill={EXIT_COLORS[entry.bucket] ?? "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid #334155",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="pc-chart">
          <div className="pc-chart-head">
            <h3>By salesperson</h3>
            <p>Avg net hold · most hold → most overallow</p>
          </div>
          {salespersonRows.length === 0 ? (
            <p className="pc-meta">No trade holds attributed to salespeople.</p>
          ) : (
            <div className="trades-hold-bars">
              {salespersonRows.map((row) => {
                const hold = row.avgHold;
                const isNeg = hold != null && hold < 0;
                const isPos = hold != null && hold >= 0;
                const pct =
                  hold == null || salespersonHoldMax <= 0
                    ? 0
                    : (Math.abs(hold) / salespersonHoldMax) * 50;
                const name =
                  multiStoreView && row.storeName
                    ? `${row.label} (${row.storeName})`
                    : row.label;
                return (
                  <div key={row.salespersonId} className="trades-hold-row">
                    <div className="trades-hold-label" title={name}>
                      {name}
                    </div>
                    <div className="trades-hold-track" aria-hidden>
                      <div className="trades-hold-mid" />
                      {hold != null && pct > 0 ? (
                        <div
                          className={cn(
                            "trades-hold-fill",
                            isNeg ? "is-neg" : "is-pos"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "trades-hold-value",
                        isNeg && "is-neg",
                        isPos && "is-pos"
                      )}
                    >
                      {fmt$(hold)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="pc-panel">
        <p className="pc-panel-label">By department</p>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("label")}
                  >
                    Department
                    {sortMarker(deptSortKey, "label", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("tradeCount")}
                  >
                    Trades
                    {sortMarker(deptSortKey, "tradeCount", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("attachPct")}
                  >
                    Trade %
                    {sortMarker(deptSortKey, "attachPct", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("totalAcv")}
                  >
                    ACV
                    {sortMarker(deptSortKey, "totalAcv", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("totalAllowance")}
                  >
                    Allowance
                    {sortMarker(deptSortKey, "totalAllowance", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("netHold")}
                  >
                    Net hold
                    {sortMarker(deptSortKey, "netHold", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("avgHold")}
                  >
                    Avg hold
                    {sortMarker(deptSortKey, "avgHold", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("retailCount")}
                  >
                    Retail
                    {sortMarker(deptSortKey, "retailCount", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("wholesaleCount")}
                  >
                    Wholesale
                    {sortMarker(deptSortKey, "wholesaleCount", deptSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleDeptSort("unknownCount")}
                  >
                    Unknown
                    {sortMarker(deptSortKey, "unknownCount", deptSortDir)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDeptRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="pc-meta">
                    No deals in this range.
                  </td>
                </tr>
              ) : (
                sortedDeptRows.map((row) => (
                  <tr key={row.departmentId}>
                    <td>
                      {row.label}
                      {multiStoreView && row.storeName
                        ? ` (${row.storeName})`
                        : null}
                    </td>
                    <td align="right">{fmtN(row.tradeCount)}</td>
                    <td align="right">{fmtPct(row.attachPct)}</td>
                    <td align="right">{fmt$(row.totalAcv)}</td>
                    <td align="right">{fmt$(row.totalAllowance)}</td>
                    <td align="right">{fmt$(row.netHold)}</td>
                    <td align="right">{fmt$(row.avgHold)}</td>
                    <td align="right">{fmtN(row.retailCount)}</td>
                    <td align="right">{fmtN(row.wholesaleCount)}</td>
                    <td align="right">{fmtN(row.unknownCount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pc-panel">
        <p className="pc-panel-label">
          All trades ({fmtN(enriched.length)})
        </p>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("sale_date")}
                  >
                    Sale date
                    {sortMarker(tradeSortKey, "sale_date", tradeSortDir)}
                  </button>
                </th>
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("vehicle")}
                  >
                    Vehicle
                    {sortMarker(tradeSortKey, "vehicle", tradeSortDir)}
                  </button>
                </th>
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("exit")}
                  >
                    Exit
                    {sortMarker(tradeSortKey, "exit", tradeSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("acv")}
                  >
                    ACV
                    {sortMarker(tradeSortKey, "acv", tradeSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("allowance")}
                  >
                    Allowance
                    {sortMarker(tradeSortKey, "allowance", tradeSortDir)}
                  </button>
                </th>
                <th align="right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("hold")}
                  >
                    Hold
                    {sortMarker(tradeSortKey, "hold", tradeSortDir)}
                  </button>
                </th>
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("departmentName")}
                  >
                    Department
                    {sortMarker(tradeSortKey, "departmentName", tradeSortDir)}
                  </button>
                </th>
                {multiStoreView ? (
                  <th align="left">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleTradeSort("storeName")}
                    >
                      Store
                      {sortMarker(tradeSortKey, "storeName", tradeSortDir)}
                    </button>
                  </th>
                ) : null}
                <th align="left">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggleTradeSort("deal")}
                  >
                    Deal
                    {sortMarker(tradeSortKey, "deal", tradeSortDir)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.length === 0 ? (
                <tr>
                  <td
                    colSpan={multiStoreView ? 9 : 8}
                    className="pc-meta"
                  >
                    No trades in this range.
                  </td>
                </tr>
              ) : (
                sortedTrades.map((t) => {
                  const vehicle = [t.year, t.make, t.model]
                    .filter((x) => x != null && x !== "")
                    .join(" ");
                  return (
                    <tr key={t.id}>
                      <td>{formatDisplayDate(t.sale_date)}</td>
                      <td>
                        <div>{vehicle || "—"}</div>
                        {t.vin ? (
                          <div className="pc-meta" style={{ margin: 0 }}>
                            {t.vin}
                          </div>
                        ) : null}
                      </td>
                      <td>{exitBucketLabel(t.exit)}</td>
                      <td align="right">{fmt$(t.acv)}</td>
                      <td align="right">{fmt$(t.allowance)}</td>
                      <td
                        align="right"
                        className={cn(
                          t.hold != null && t.hold < 0 && "text-red-400",
                          t.hold != null && t.hold >= 0 && "text-emerald-400"
                        )}
                      >
                        {fmt$(t.hold)}
                      </td>
                      <td>{t.departmentName}</td>
                      {multiStoreView ? <td>{t.storeName}</td> : null}
                      <td>
                        <Link
                          href={`/app/deals/${t.deal_id}/edit`}
                          className="pc-link"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
