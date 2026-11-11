"use client";

import type {
  Dimension,
  ProfitFilters,
  RollupRow,
} from "@/lib/profit-center/aggregate";
import { PRICE_BANDS } from "@/lib/profit-center/priceBands";
import { TRUCK_CLASS_LABELS } from "@/lib/profit-center/truckClass";
import {
  columnExtent,
  heatmapStyle,
  type HeatPolarity,
} from "@/lib/profit-center/heatmap";
import { cn } from "@/lib/utils";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { fmt$, fmtN, fmtPct } from "../format";

type SortKey = keyof RollupRow;

type ColDef = {
  key: SortKey;
  label: string;
  format: (row: RollupRow) => string;
  heat?: HeatPolarity;
  numeric?: (row: RollupRow) => number | null;
  salespersonOnly?: boolean;
};

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: "make", label: "Make" },
  { id: "model", label: "Model" },
  { id: "year", label: "Year" },
  { id: "price", label: "Sale Price" },
  { id: "odometer", label: "Odometer" },
  { id: "acquisition", label: "Acquisition" },
  { id: "body_style", label: "Body Style" },
  { id: "truck_class", label: "Truck Class" },
  { id: "department", label: "Department" },
  { id: "salesperson", label: "Salesperson" },
];

const COLUMNS: ColDef[] = [
  { key: "label", label: "Group", format: (r) => r.label },
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

type Salesperson = { id: string; name: string; store_id: string };

type Props = {
  filters: ProfitFilters;
  setFilters: Dispatch<SetStateAction<ProfitFilters>>;
  emptyFilters: ProfitFilters;
  filterOptions: {
    makes: string[];
    models: string[];
    years: string[];
    acquisitions: string[];
    bodyStyles: string[];
  };
  salespeople: Salesperson[];
  dimension: Dimension;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (key: SortKey) => void;
  onDimensionChange: (d: Dimension) => void;
  sortedRows: RollupRow[];
  total: RollupRow;
  filteredCount: number;
  dealsCount: number;
};

export default function DealTableTab({
  filters,
  setFilters,
  emptyFilters,
  filterOptions,
  salespeople,
  dimension,
  sortKey,
  sortDir,
  toggleSort,
  onDimensionChange,
  sortedRows,
  total,
  filteredCount,
  dealsCount,
}: Props) {
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

  return (
    <div className="space-y-4">
      <div className="pc-buybox-head">
        <h2>Full deal table</h2>
        <p>Roll up closed deals by dimension.</p>
      </div>

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
          onClick={() => setFilters(emptyFilters)}
        >
          Clear filters
        </button>
      </section>

      <div className="pc-tabs">
        {DIMENSIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onDimensionChange(d.id)}
            className={cn("pc-tab", dimension === d.id && "is-active")}
          >
            {d.label}
          </button>
        ))}
      </div>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        {filteredCount === 0 ? (
          <div className="pc-empty">
            No closed deals in this range
            {dealsCount > 0 ? " match your filters" : ""}. Adjust the date range
            or clear filters to see results.
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
