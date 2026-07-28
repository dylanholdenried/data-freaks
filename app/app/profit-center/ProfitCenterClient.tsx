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
import { columnExtent, heatmapStyle, type HeatPolarity } from "@/lib/profit-center/heatmap";
import { TRUCK_CLASS_LABELS } from "@/lib/profit-center/truckClass";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };

type SortKey = keyof RollupRow;

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "make", label: "Make" },
  { id: "model", label: "Model" },
  { id: "year", label: "Year" },
  { id: "price", label: "Sale Price" },
  { id: "acquisition", label: "Acquisition" },
  { id: "body_style", label: "Body Style" },
  { id: "truck_class", label: "Truck Class" },
  { id: "salesperson", label: "Salesperson" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SEL =
  "h-9 rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

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
    label: "Avg Age",
    format: (r) => fmtN(r.avgAge, 0),
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
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  salespeople: Salesperson[];
  dealSalespeople: ProfitDealSalesperson[];
  preset: DatePreset;
  year: number;
  month: number;
  customFrom: string;
  customTo: string;
  range: DateRange;
}

export default function ProfitCenterClient({
  stores,
  deals,
  trades,
  salespeople,
  dealSalespeople,
  preset,
  year,
  month,
  customFrom,
  customTo,
  range,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [dimension, setDimension] = useState<Dimension>("make");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<ProfitFilters>({
    storeId: "all",
    make: "all",
    model: "all",
    year: "all",
    priceBandId: "all",
    acquisition: "all",
    bodyStyle: "all",
    truckClass: "all",
    salespersonId: "all",
    financeType: "all",
  });

  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);
  const salespersonNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespeople) m.set(s.id, s.name);
    return m;
  }, [salespeople]);

  const filtered = useMemo(
    () => filterDeals(deals, filters, { tradesByDeal, dealSalespeople }),
    [deals, filters, tradesByDeal, dealSalespeople]
  );

  const { rows, total } = useMemo(() => {
    return aggregateByDimension(dimension, {
      deals: filtered,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
    });
  }, [dimension, filtered, tradesByDeal, dealSalespeople, salespersonNames]);

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
    (next: {
      preset: DatePreset;
      year?: number;
      month?: number;
      from?: string;
      to?: string;
    }) => {
      const params = new URLSearchParams();
      params.set("preset", next.preset);
      if (next.preset === "month") {
        params.set("year", String(next.year ?? year));
        params.set("month", String(next.month ?? month));
      }
      if (next.preset === "custom") {
        params.set("from", next.from ?? customFrom);
        params.set("to", next.to ?? customTo);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, year, month, customFrom, customTo]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  }

  const yearsForPicker = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white shadow-sm">
        <p className="app-kicker text-slate-300">Acquisition intelligence</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Profit Center
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Closed-deal performance by make, model, price point, acquisition source,
          and more — so you know what to buy and what to avoid.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Showing {range.from} → {range.to} · {filtered.length.toLocaleString()} closed
          deal{filtered.length === 1 ? "" : "s"}
          {filtered.length !== deals.length
            ? ` (filtered from ${deals.length.toLocaleString()})`
            : ""}
        </p>
      </header>

      {/* Date controls */}
      <section className="app-panel space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Date range
        </p>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => navigateDate({ preset: opt.value })}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                preset === opt.value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {preset === "month" && (
          <div className="flex flex-wrap gap-2">
            <select
              className={SEL}
              value={month}
              onChange={(e) =>
                navigateDate({
                  preset: "month",
                  month: Number(e.target.value),
                  year,
                })
              }
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className={SEL}
              value={year}
              onChange={(e) =>
                navigateDate({
                  preset: "month",
                  month,
                  year: Number(e.target.value),
                })
              }
            >
              {yearsForPicker.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">From</label>
              <input
                type="date"
                className={SEL}
                value={customFrom}
                onChange={(e) =>
                  navigateDate({
                    preset: "custom",
                    from: e.target.value,
                    to: customTo,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">To</label>
              <input
                type="date"
                className={SEL}
                value={customTo}
                onChange={(e) =>
                  navigateDate({
                    preset: "custom",
                    from: customFrom,
                    to: e.target.value,
                  })
                }
              />
            </div>
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="app-panel space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Filters
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {stores.length > 1 && (
            <select
              className={SEL}
              value={filters.storeId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, storeId: e.target.value }))
              }
            >
              <option value="all">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
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
            className={SEL}
            value={filters.financeType}
            onChange={(e) =>
              setFilters((f) => ({ ...f, financeType: e.target.value }))
            }
          >
            <option value="all">All finance types</option>
            <option value="prime">Prime</option>
            <option value="subprime">Subprime</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
          onClick={() =>
            setFilters({
              storeId: "all",
              make: "all",
              model: "all",
              year: "all",
              priceBandId: "all",
              acquisition: "all",
              bodyStyle: "all",
              truckClass: "all",
              salespersonId: "all",
              financeType: "all",
            })
          }
        >
          Clear filters
        </button>
      </section>

      {/* Dimension tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {DIMENSIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setDimension(d.id);
              setSortKey("volume");
              setSortDir("desc");
            }}
            className={cn(
              "-mb-px rounded-t-lg px-3 py-2 text-sm font-medium transition",
              dimension === d.id
                ? "border border-b-white border-slate-200 bg-white text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="app-panel overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No closed deals in this range
            {deals.length > 0 ? " match your filters" : ""}. Adjust the date
            range or clear filters to see results.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {visibleCols.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "sticky top-0 whitespace-nowrap px-2.5 py-2.5 font-semibold text-slate-600",
                        col.align === "left" ? "text-left" : "text-right"
                      )}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
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
                          className={cn(
                            "whitespace-nowrap px-2.5 py-2 tabular-nums",
                            col.align === "left"
                              ? "text-left font-medium text-slate-800"
                              : "text-right text-slate-700"
                          )}
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
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                  {visibleCols.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "whitespace-nowrap px-2.5 py-2.5 tabular-nums text-slate-900",
                        col.align === "left" ? "text-left" : "text-right"
                      )}
                    >
                      {col.format(total)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {dimension === "salesperson" && (
        <p className="text-xs text-slate-500">
          Avg Lost Gross = sale price − list price (deals marked list-price NA are
          excluded). Avg Trade Hold = ACV − allowance (averaged per deal, then
          across deals). Negative values are unfavorable.
        </p>
      )}
    </div>
  );
}
