"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  aggregateByDimension,
  buildTradesByDeal,
  filterDeals,
  type Dimension,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitFilters,
  type ProfitTrade,
  type RollupRow,
} from "@/lib/profit-center/aggregate";
import {
  DATE_PRESET_OPTIONS,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import { PRICE_BANDS } from "@/lib/profit-center/priceBands";
import {
  columnExtent,
  heatmapStyle,
  statusRgb,
  type HeatPolarity,
} from "@/lib/profit-center/heatmap";
import { TRUCK_CLASS_LABELS } from "@/lib/profit-center/truckClass";
import {
  scoreBuyBox,
  type BuyBoxSettings,
} from "@/lib/profit-center/buyBox";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };
type Department = { id: string; name: string; store_id: string };

type SortKey = keyof RollupRow;

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "make", label: "Make" },
  { id: "model", label: "Model" },
  { id: "year", label: "Year" },
  { id: "price", label: "Sale Price" },
  { id: "acquisition", label: "Acquisition" },
  { id: "body_style", label: "Body Style" },
  { id: "truck_class", label: "Truck Class" },
  { id: "department", label: "Department" },
  { id: "salesperson", label: "Salesperson" },
];

const EMPTY_FILTERS: ProfitFilters = {
  storeId: "all",
  departmentName: "all",
  make: "all",
  model: "all",
  year: "all",
  priceBandId: "all",
  acquisition: "all",
  bodyStyle: "all",
  truckClass: "all",
  salespersonId: "all",
  financeType: "all",
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

/** Compact store pill labels (e.g. Jim Butler Centralia → CENTRALIA). */
function storePillLabel(name: string) {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return jb[1].trim().toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!.toUpperCase();
  return n.toUpperCase();
}

type ColDef = {
  key: SortKey;
  label: string;
  align?: "left" | "right";
  format: (row: RollupRow) => string;
  heat?: HeatPolarity;
  numeric?: (row: RollupRow) => number | null;
  salespersonOnly?: boolean;
};

const COLUMNS: ColDef[] = [
  { key: "label", label: "Group", align: "left", format: (r) => r.label },
  {
    key: "volume",
    label: "Volume",
    format: (r) => fmtN(r.volume),
    heat: "higherBetter",
    numeric: (r) => r.volume,
  },
  {
    key: "front",
    label: "Front",
    format: (r) => fmt$(r.front),
    heat: "higherBetter",
    numeric: (r) => r.front,
  },
  {
    key: "back",
    label: "Back",
    format: (r) => fmt$(r.back),
    heat: "higherBetter",
    numeric: (r) => r.back,
  },
  {
    key: "total",
    label: "Total",
    format: (r) => fmt$(r.total),
    heat: "higherBetter",
    numeric: (r) => r.total,
  },
  {
    key: "avgFront",
    label: "Avg Front",
    format: (r) => fmt$(r.avgFront),
    heat: "higherBetter",
    numeric: (r) => r.avgFront,
  },
  {
    key: "avgBack",
    label: "Avg Back",
    format: (r) => fmt$(r.avgBack),
    heat: "higherBetter",
    numeric: (r) => r.avgBack,
  },
  {
    key: "avgTotal",
    label: "Avg Total",
    format: (r) => fmt$(r.avgTotal),
    heat: "higherBetter",
    numeric: (r) => r.avgTotal,
  },
  {
    key: "avgAge",
    label: "Avg Turn",
    format: (r) => (r.avgAge == null ? "—" : `${fmtN(r.avgAge, 0)}d`),
    heat: "lowerBetter",
    numeric: (r) => r.avgAge,
  },
  {
    key: "avgSalePrice",
    label: "Avg Sale $",
    format: (r) => fmt$(r.avgSalePrice),
    heat: "higherBetter",
    numeric: (r) => r.avgSalePrice,
  },
  {
    key: "trades",
    label: "Trades",
    format: (r) => fmtN(r.trades),
    heat: "higherBetter",
    numeric: (r) => r.trades,
  },
  {
    key: "tradePct",
    label: "Trade %",
    format: (r) => fmtPct(r.tradePct),
    heat: "higherBetter",
    numeric: (r) => r.tradePct,
  },
  {
    key: "primePct",
    label: "Prime %",
    format: (r) => fmtPct(r.primePct),
    heat: "higherBetter",
    numeric: (r) => r.primePct,
  },
  {
    key: "subprimePct",
    label: "Subprime %",
    format: (r) => fmtPct(r.subprimePct),
    heat: "higherBetter",
    numeric: (r) => r.subprimePct,
  },
  {
    key: "cashPct",
    label: "Cash %",
    format: (r) => fmtPct(r.cashPct),
    heat: "higherBetter",
    numeric: (r) => r.cashPct,
  },
  {
    key: "avgLostGross",
    label: "Avg Lost Gross",
    format: (r) => fmt$(r.avgLostGross),
    heat: "higherBetter",
    numeric: (r) => r.avgLostGross,
    salespersonOnly: true,
  },
  {
    key: "avgTradeHold",
    label: "Avg Trade Hold",
    format: (r) => fmt$(r.avgTradeHold),
    heat: "higherBetter",
    numeric: (r) => r.avgTradeHold,
    salespersonOnly: true,
  },
];

interface Props {
  stores: Store[];
  departments: Department[];
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  salespeople: Salesperson[];
  dealSalespeople: ProfitDealSalesperson[];
  buyBoxSettings: BuyBoxSettings;
  groupName: string;
  preset: DatePreset;
  range: DateRange;
}

export default function ProfitCenterClient({
  stores,
  departments,
  deals,
  trades,
  salespeople,
  dealSalespeople,
  buyBoxSettings,
  groupName,
  preset,
  range,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [dimension, setDimension] = useState<Dimension>("make");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<ProfitFilters>(EMPTY_FILTERS);

  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);
  const salespersonNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespeople) m.set(s.id, s.name);
    return m;
  }, [salespeople]);
  const departmentNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const filtered = useMemo(
    () =>
      filterDeals(deals, filters, {
        tradesByDeal,
        dealSalespeople,
        departmentNames,
      }),
    [deals, filters, tradesByDeal, dealSalespeople, departmentNames]
  );

  const ctx = useMemo(
    () => ({
      deals: filtered,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
      departmentNames,
    }),
    [filtered, tradesByDeal, dealSalespeople, salespersonNames, departmentNames]
  );

  const { rows, total } = useMemo(
    () => aggregateByDimension(dimension, ctx),
    [dimension, ctx]
  );

  const modelRows = useMemo(() => {
    if (dimension === "model") return rows;
    return aggregateByDimension("model", ctx).rows;
  }, [dimension, rows, ctx]);

  const buyBox = useMemo(
    () => scoreBuyBox(modelRows, buyBoxSettings),
    [modelRows, buyBoxSettings]
  );

  const makeRows = useMemo(() => {
    if (dimension === "make") return rows;
    return aggregateByDimension("make", ctx).rows;
  }, [dimension, rows, ctx]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = typeof av === "number" ? av : av == null ? -Infinity : Number(av);
      const bn = typeof bv === "number" ? bv : bv == null ? -Infinity : Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const visibleCols = useMemo(
    () =>
      COLUMNS.filter(
        (c) => !c.salespersonOnly || dimension === "salesperson"
      ),
    [dimension]
  );

  const extents = useMemo(() => {
    const map = new Map<SortKey, { min: number; max: number }>();
    for (const col of visibleCols) {
      if (!col.numeric || !col.heat) continue;
      const ext = columnExtent(sortedRows.map((r) => col.numeric!(r)));
      if (ext) map.set(col.key, ext);
    }
    return map;
  }, [sortedRows, visibleCols]);

  const deptOptions = useMemo(() => {
    const scoped =
      filters.storeId === "all"
        ? departments
        : departments.filter((d) => d.store_id === filters.storeId);
    const names = [...new Set(scoped.map((d) => d.name))].sort((a, b) =>
      a.localeCompare(b)
    );
    return names;
  }, [departments, filters.storeId]);

  const filterOptions = useMemo(() => {
    const makes = [...new Set(deals.map((d) => d.vehicle_make))].sort();
    const models = [
      ...new Set(
        deals
          .filter((d) => filters.make === "all" || d.vehicle_make === filters.make)
          .map((d) => d.vehicle_model)
      ),
    ].sort();
    const years = [...new Set(deals.map((d) => String(d.vehicle_year)))].sort(
      (a, b) => Number(b) - Number(a)
    );
    const acquisitions = [
      ...new Set(
        deals.map((d) => d.acquisition_source?.trim() || "(Unknown)")
      ),
    ].sort();
    const bodyStyles = [
      ...new Set(deals.map((d) => d.body_style?.trim() || "(Unknown)")),
    ].sort();
    return { makes, models, years, acquisitions, bodyStyles };
  }, [deals, filters.make]);

  const navigateDate = useCallback(
    (nextPreset: DatePreset) => {
      const params = new URLSearchParams();
      params.set("preset", nextPreset);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  }

  const selectedStore =
    filters.storeId === "all"
      ? null
      : stores.find((s) => s.id === filters.storeId) ?? null;

  const title = selectedStore?.name ?? (stores.length > 1 ? "All Stores" : groupName || "Profit Center");

  const maxMakeVol = Math.max(1, ...makeRows.map((r) => r.volume));
  const makeAgeExtent = columnExtent(makeRows.map((r) => r.avgAge));

  const ages = filtered
    .map((d) => d.age)
    .filter((a): a is number => a != null && Number.isFinite(a));
  const avgTurn =
    ages.length === 0 ? null : ages.reduce((s, a) => s + a, 0) / ages.length;
  const tradeDealCount = filtered.filter(
    (d) => (tradesByDeal.get(d.id) ?? []).length > 0
  ).length;
  const tradePct =
    filtered.length === 0 ? null : (tradeDealCount / filtered.length) * 100;

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquisition intelligence</p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01" ? "All time" : `${range.from} → ${range.to}`}
            {" · "}
            {filtered.length.toLocaleString()} closed deal
            {filtered.length === 1 ? "" : "s"}
            {" · "}
            {fmt$(total.total)} total gross
            {filtered.length !== deals.length
              ? ` · filtered from ${deals.length.toLocaleString()}`
              : ""}
          </p>
        </div>
        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Store">
            <button
              type="button"
              className={cn("pc-pill", filters.storeId === "all" && "is-active")}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  storeId: "all",
                  departmentName: "all",
                }))
              }
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "pc-pill",
                  filters.storeId === s.id && "is-active"
                )}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    storeId: s.id,
                    departmentName: "all",
                  }))
                }
              >
                {storePillLabel(s.name)}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">Date range</p>
        <div className="pc-pill-row">
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => navigateDate(opt.value)}
              className={cn(
                "pc-pill is-soft",
                preset === opt.value && "is-active"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {deptOptions.length > 0 && (
        <section className="pc-panel">
          <p className="pc-panel-label">Department</p>
          <div className="pc-pill-row">
            <button
              type="button"
              className={cn(
                "pc-pill is-soft",
                filters.departmentName === "all" && "is-active"
              )}
              onClick={() =>
                setFilters((f) => ({ ...f, departmentName: "all" }))
              }
            >
              All
            </button>
            {deptOptions.map((name) => (
              <button
                key={name}
                type="button"
                className={cn(
                  "pc-pill is-soft",
                  filters.departmentName === name && "is-active"
                )}
                onClick={() =>
                  setFilters((f) => ({ ...f, departmentName: name }))
                }
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Units closed</div>
          <div className="pc-kpi-value amber">{fmtN(filtered.length)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total front</div>
          <div className="pc-kpi-value">{fmt$(total.front)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total back</div>
          <div className="pc-kpi-value">{fmt$(total.back)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg total gross</div>
          <div className="pc-kpi-value green">{fmt$(total.avgTotal)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg turn</div>
          <div
            className={cn(
              "pc-kpi-value",
              avgTurn != null && avgTurn > 45 ? "red" : "amber"
            )}
          >
            {avgTurn == null ? "—" : `${fmtN(avgTurn, 0)}d`}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade %</div>
          <div className="pc-kpi-value">{fmtPct(tradePct)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Buy signals</div>
          <div className="pc-kpi-value green">{buyBox.buys.length}</div>
          <div className="pc-kpi-sub">min {buyBoxSettings.minVolume} deals</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Red-lights</div>
          <div className="pc-kpi-value red">{buyBox.reds.length}</div>
          <div className="pc-kpi-sub">min {buyBoxSettings.minVolume} deals</div>
        </div>
      </div>

      <section className="pc-buybox">
        <div className="pc-buybox-head">
          <h2>Buy-box &amp; red-lights</h2>
          <p>
            Models scored on front profit, back profit, turn (avg age), and trade
            % — weighted and adjustable by admin. Needs at least{" "}
            {buyBoxSettings.minVolume} closed deals to rate.
          </p>
        </div>
        <div className="pc-buybox-cols">
          <div>
            <div className="pc-buybox-title buy">Buy more</div>
            {buyBox.buys.length === 0 ? (
              <p className="pc-muted">
                No models meet the minimum volume in this cut.
              </p>
            ) : (
              buyBox.buys.map((row) => (
                <div key={row.key} className="pc-buybox-row">
                  <div>
                    <b>{row.label}</b>
                    <span>
                      {row.volume} deals · front {fmt$(row.avgFront)} · back{" "}
                      {fmt$(row.avgBack)} · {fmtN(row.avgAge, 0)}d · trade{" "}
                      {fmtPct(row.tradePct)}
                    </span>
                  </div>
                  <div className="pc-buybox-score buy">
                    {(row.score * 100).toFixed(0)}
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <div className="pc-buybox-title red">Red-light</div>
            {buyBox.reds.length === 0 ? (
              <p className="pc-muted">No red-lights in this cut.</p>
            ) : (
              buyBox.reds.map((row) => (
                <div key={row.key} className="pc-buybox-row">
                  <div>
                    <b>{row.label}</b>
                    <span>
                      {row.volume} deals · front {fmt$(row.avgFront)} · back{" "}
                      {fmt$(row.avgBack)} · {fmtN(row.avgAge, 0)}d · trade{" "}
                      {fmtPct(row.tradePct)}
                    </span>
                  </div>
                  <div className="pc-buybox-score red">
                    {(row.score * 100).toFixed(0)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="pc-chart">
        <div className="pc-chart-head">
          <div>
            <h3>By make</h3>
            <p>count vs avg turn — long and slow is the red flag</p>
          </div>
        </div>
        {makeRows.length === 0 ? (
          <p className="pc-muted">No deals to chart.</p>
        ) : (
          makeRows.slice(0, 12).map((row) => {
            const widthPct = Math.max(8, (row.volume / maxMakeVol) * 100);
            let t = 0.5;
            if (makeAgeExtent && row.avgAge != null) {
              const { min, max } = makeAgeExtent;
              if (max !== min) {
                t = 1 - (row.avgAge - min) / (max - min);
              }
            }
            const color = statusRgb(t);
            return (
              <div key={row.key} className="pc-bar-row">
                <div className="pc-bar-label" title={row.label}>
                  {row.label}
                </div>
                <div className="pc-bar-track">
                  <div
                    className="pc-bar-fill"
                    style={{ width: `${widthPct}%`, background: color }}
                  >
                    {row.volume}
                  </div>
                </div>
                <div className="pc-bar-stats" style={{ color }}>
                  {fmtN(row.avgAge, 0)}d avg · {fmt$(row.avgTotal)}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="pc-panel space-y-3">
        <p className="pc-panel-label">More filters</p>
        <div className="pc-filters">
          <select
            value={filters.make}
            onChange={(e) =>
              setFilters((f) => ({ ...f, make: e.target.value, model: "all" }))
            }
          >
            <option value="all">All makes</option>
            {filterOptions.makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filters.model}
            onChange={(e) =>
              setFilters((f) => ({ ...f, model: e.target.value }))
            }
          >
            <option value="all">All models</option>
            {filterOptions.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filters.year}
            onChange={(e) =>
              setFilters((f) => ({ ...f, year: e.target.value }))
            }
          >
            <option value="all">All years</option>
            {filterOptions.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={filters.priceBandId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priceBandId: e.target.value }))
            }
          >
            <option value="all">All price points</option>
            {PRICE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={filters.acquisition}
            onChange={(e) =>
              setFilters((f) => ({ ...f, acquisition: e.target.value }))
            }
          >
            <option value="all">All acquisition sources</option>
            {filterOptions.acquisitions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filters.bodyStyle}
            onChange={(e) =>
              setFilters((f) => ({ ...f, bodyStyle: e.target.value }))
            }
          >
            <option value="all">All body styles</option>
            {filterOptions.bodyStyles.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={filters.truckClass}
            onChange={(e) =>
              setFilters((f) => ({ ...f, truckClass: e.target.value }))
            }
          >
            <option value="all">All truck classes</option>
            {TRUCK_CLASS_LABELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filters.salespersonId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, salespersonId: e.target.value }))
            }
          >
            <option value="all">All salespeople</option>
            {salespeople
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <select
            value={filters.financeType}
            onChange={(e) =>
              setFilters((f) => ({ ...f, financeType: e.target.value }))
            }
          >
            <option value="all">All finance types</option>
            <option value="prime">Prime</option>
            <option value="subprime">Subprime</option>
            <option value="lease">Lease</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <button
          type="button"
          className="pc-link"
          onClick={() => setFilters(EMPTY_FILTERS)}
        >
          Clear filters
        </button>
      </section>

      <div className="pc-tabs">
        {DIMENSIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setDimension(d.id);
              setSortKey("volume");
              setSortDir("desc");
            }}
            className={cn("pc-tab", dimension === d.id && "is-active")}
          >
            {d.label}
          </button>
        ))}
      </div>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div className="pc-empty">
            No closed deals in this range
            {deals.length > 0 ? " match your filters" : ""}. Adjust the date
            range or clear filters to see results.
          </div>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  {visibleCols.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className="pc-sort"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortKey === col.key
                          ? sortDir === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.key}>
                    {visibleCols.map((col) => {
                      const ext = extents.get(col.key);
                      const style =
                        col.heat && col.numeric && ext && row.volume > 0
                          ? heatmapStyle(
                              col.numeric(row),
                              ext.min,
                              ext.max,
                              col.heat
                            )
                          : undefined;
                      return (
                        <td
                          key={col.key}
                          style={col.key === "label" ? undefined : style}
                        >
                          {col.format(row)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {visibleCols.map((col) => (
                    <td key={col.key}>{col.format(total)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {dimension === "salesperson" && (
        <p className="pc-footnote">
          Avg Lost Gross = sale price − list price (deals marked list-price NA
          are excluded). Avg Trade Hold = ACV − allowance (averaged per deal,
          then across deals). Negative values are unfavorable.
        </p>
      )}
    </div>
  );
}
