"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { shortStoreLabel } from "@/lib/acquire/store-labels";
import { modelCohortHref } from "@/lib/profit-center/cohort";
import { pcFmt$, pcFmtN } from "@/lib/profit-center/format";
import {
  buildSoldVsStockRows,
  filterRowsByAction,
} from "@/lib/sold-vs-stock/aggregate";
import {
  SOLD_VS_STOCK_PRESET_OPTIONS,
  type DateRange,
  type SoldVsStockPreset,
} from "@/lib/sold-vs-stock/dateRange";
import type {
  SoldVsStockChildRow,
  SoldVsStockDeal,
  SoldVsStockModelRow,
  SoldVsStockUnit,
  StockAction,
} from "@/lib/sold-vs-stock/types";

type Store = { id: string; name: string };

type Props = {
  stores: Store[];
  deals: SoldVsStockDeal[];
  priorDeals: SoldVsStockDeal[];
  units: SoldVsStockUnit[];
  groupName: string;
  preset: SoldVsStockPreset;
  range: DateRange;
  priorRange: DateRange;
  windowDays: number;
  snapshotDate: string | null;
  initialStoreIds: string[];
};

type ActionFilter = StockAction | "all";

type SortKey =
  | "label"
  | "sold"
  | "onLot"
  | "gap"
  | "coverage"
  | "daysToStockout"
  | "avgAge"
  | "avgFront"
  | "avgBack"
  | "avgTotal"
  | "action";

type SortDir = "asc" | "desc";

const ACTION_META: Record<StockAction, { label: string; chip: string }> = {
  need_more: { label: "Need more", chip: "svs-chip need-more" },
  too_much: { label: "Too much", chip: "svs-chip too-much" },
  balanced: { label: "Balanced", chip: "svs-chip balanced" },
  watch: { label: "Watch", chip: "svs-chip watch" },
};

const ACTION_SORT_ORDER: Record<StockAction, number> = {
  need_more: 0,
  too_much: 1,
  balanced: 2,
  watch: 3,
};

const SORTABLE_COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "label", label: "Make / model" },
  { key: "sold", label: "Sold", numeric: true },
  { key: "onLot", label: "On lot", numeric: true },
  { key: "gap", label: "Gap", numeric: true },
  { key: "coverage", label: "Coverage", numeric: true },
  { key: "daysToStockout", label: "Stockout", numeric: true },
  { key: "avgAge", label: "Avg age", numeric: true },
  { key: "avgFront", label: "Avg front", numeric: true },
  { key: "avgBack", label: "Avg back", numeric: true },
  { key: "avgTotal", label: "Avg total", numeric: true },
  { key: "action", label: "Signal" },
];

function sortMarker(activeKey: SortKey | null, key: SortKey, dir: SortDir): string {
  if (activeKey !== key) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: SortDir
): number {
  const an = a == null || !Number.isFinite(a) ? null : a;
  const bn = b == null || !Number.isFinite(b) ? null : b;
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  return dir === "asc" ? an - bn : bn - an;
}

function compareString(a: string, b: string, dir: SortDir): number {
  const c = a.localeCompare(b);
  return dir === "asc" ? c : -c;
}

function sortValue(
  row: SoldVsStockModelRow,
  key: SortKey
): number | string | null {
  switch (key) {
    case "label":
      return row.label;
    case "sold":
      return row.sold;
    case "onLot":
      return row.onLot;
    case "gap":
      return row.gap;
    case "coverage":
      return row.coverage;
    case "daysToStockout":
      return row.daysToStockout;
    case "avgAge":
      return row.avgAge;
    case "avgFront":
      return row.avgFront;
    case "avgBack":
      return row.avgBack;
    case "avgTotal":
      return row.avgTotal;
    case "action":
      return ACTION_SORT_ORDER[row.action];
  }
}

function defaultSortDir(key: SortKey): SortDir {
  return key === "label" || key === "action" ? "asc" : "desc";
}

function formatCoverage(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}x`;
}

function formatDays(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0d";
  return `${Math.round(v)}d`;
}

function profitPresetFor(
  preset: SoldVsStockPreset
): "mtd" | "last_month" | "ytd" | "last_12_months" {
  if (preset === "mtd" || preset === "ytd" || preset === "last_month") {
    return preset;
  }
  if (preset === "last_12_months") return "last_12_months";
  return "last_month";
}

function Velocity({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="svs-vel up" title="Sold more than prior window">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="svs-vel down" title="Sold less than prior window">
        <ArrowDownRight className="h-3.5 w-3.5" />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span className="svs-vel flat" title="Flat vs prior window">
      <Minus className="h-3.5 w-3.5" />
      0
    </span>
  );
}

function soldVsStockHref(opts: {
  preset: SoldVsStockPreset;
  storeIds: string[];
  allStoreIds: string[];
}) {
  const params = new URLSearchParams();
  if (opts.preset !== "last_30_days") params.set("preset", opts.preset);
  const allSelected =
    opts.storeIds.length === opts.allStoreIds.length &&
    opts.allStoreIds.every((id) => opts.storeIds.includes(id));
  if (!allSelected && opts.storeIds.length > 0) {
    params.set("stores", opts.storeIds.join(","));
  }
  const q = params.toString();
  return q ? `/app/sold-vs-stock?${q}` : "/app/sold-vs-stock";
}

function HighlightCard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: SoldVsStockModelRow[];
  empty: string;
}) {
  return (
    <div className="svs-highlight">
      <p className="pc-panel-label">{title}</p>
      {rows.length === 0 ? (
        <p className="pc-meta">{empty}</p>
      ) : (
        <ul className="svs-highlight-list">
          {rows.slice(0, 5).map((r) => (
            <li key={r.key}>
              <div className="svs-highlight-head">
                <span className="svs-highlight-label">{r.label}</span>
                <span className="svs-highlight-nums">
                  {r.sold} sold · {r.onLot} stock
                </span>
              </div>
              <p className="svs-why">{r.why}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildTable({
  rows,
  depth,
  expanded,
  toggle,
}: {
  rows: SoldVsStockChildRow[];
  depth: "year" | "trim";
  expanded: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <table className="svs-table svs-nested">
      <thead>
        <tr>
          <th>{depth === "year" ? "Year" : "Trim"}</th>
          <th className="num">Sold</th>
          <th className="num">On lot</th>
          <th className="num">Gap</th>
          <th className="num">Coverage</th>
          <th className="num">Stockout</th>
          <th className="num">Avg age</th>
          <th className="num">Avg front</th>
          <th className="num">Avg back</th>
          <th className="num">Avg total</th>
          <th>Signal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = expanded.has(row.key);
          const hasKids = (row.children?.length ?? 0) > 0;
          return (
            <Fragment key={row.key}>
              <tr className={cn("svs-row", row.action)}>
                <td>
                  <div className="svs-name-cell">
                    {depth === "year" && hasKids ? (
                      <button
                        type="button"
                        className="svs-expand"
                        aria-expanded={open}
                        onClick={() => toggle(row.key)}
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="svs-expand-spacer" />
                    )}
                    <span>{row.label}</span>
                  </div>
                </td>
                <td className="num">
                  <div className="svs-sold-cell">
                    {pcFmtN(row.sold, 0)}
                    <Velocity delta={row.velocityDelta} />
                  </div>
                </td>
                <td className="num">{pcFmtN(row.onLot, 0)}</td>
                <td className="num">
                  {row.gap > 0 ? `+${row.gap}` : row.gap}
                </td>
                <td className="num">{formatCoverage(row.coverage)}</td>
                <td className="num">{formatDays(row.daysToStockout)}</td>
                <td className="num">
                  {row.avgAge == null ? "—" : `${pcFmtN(row.avgAge, 0)}d`}
                </td>
                <td className="num">{pcFmt$(row.avgFront)}</td>
                <td className="num">{pcFmt$(row.avgBack)}</td>
                <td className="num">{pcFmt$(row.avgTotal)}</td>
                <td>
                  <span className={ACTION_META[row.action].chip}>
                    {ACTION_META[row.action].label}
                  </span>
                </td>
              </tr>
              {open && row.children && row.children.length > 0 ? (
                <tr className="svs-child-wrap">
                  <td colSpan={11}>
                    <ChildTable
                      rows={row.children}
                      depth="trim"
                      expanded={expanded}
                      toggle={toggle}
                    />
                    <p className="svs-why nested">{row.why}</p>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default function SoldVsStockClient({
  stores,
  deals,
  priorDeals,
  units,
  groupName,
  preset,
  range,
  priorRange,
  windowDays,
  snapshotDate,
  initialStoreIds,
}: Props) {
  const router = useRouter();
  const allIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() =>
    initialStoreIds.length > 0 ? initialStoreIds : allIds
  );
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedYears, setExpandedYears] = useState<Set<string>>(
    () => new Set()
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const allSelected =
    selectedStoreIds.length === stores.length && stores.length > 0;

  const { rows, summary } = useMemo(() => {
    const built = buildSoldVsStockRows({
      deals,
      priorDeals,
      units,
      storeIds: allSelected ? "all" : selectedStoreIds,
      windowDays,
    });
    return {
      rows: built.rows,
      summary: { ...built.summary, snapshotDate },
    };
  }, [
    deals,
    priorDeals,
    units,
    selectedStoreIds,
    allSelected,
    windowDays,
    snapshotDate,
  ]);

  const filtered = useMemo(() => {
    let list = filterRowsByAction(rows, actionFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.make.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q)
      );
    }
    if (!sortKey) return list;
    const sorted = [...list];
    sorted.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" || typeof bv === "string") {
        return compareString(String(av ?? ""), String(bv ?? ""), sortDir);
      }
      const cmp = compareNullableNumber(av, bv, sortDir);
      if (cmp !== 0) return cmp;
      return b.urgency - a.urgency;
    });
    return sorted;
  }, [rows, actionFilter, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultSortDir(key));
  }

  const needMoreTop = useMemo(
    () => rows.filter((r) => r.action === "need_more").slice(0, 5),
    [rows]
  );
  const tooMuchTop = useMemo(
    () => rows.filter((r) => r.action === "too_much").slice(0, 5),
    [rows]
  );

  function navigatePreset(next: SoldVsStockPreset) {
    router.push(
      soldVsStockHref({
        preset: next,
        storeIds: selectedStoreIds,
        allStoreIds: allIds,
      })
    );
  }

  function toggleStore(id: string) {
    setSelectedStoreIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) {
        if (set.size <= 1) return prev;
        set.delete(id);
      } else {
        set.add(id);
      }
      return Array.from(set);
    });
  }

  function selectAllStores() {
    setSelectedStoreIds(allIds);
  }

  function toggleModel(key: string) {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleYear(key: string) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pc-command svs-page">
      <header className="pc-header">
        <div>
          <p className="pc-kicker">Analyze · {groupName || "Dealer group"}</p>
          <h1 className="pc-title">Sold vs Stock</h1>
          <p className="pc-meta">
            Pre-owned retail closed deals · {range.from} → {range.to}
            {snapshotDate ? ` · Inventory as of ${snapshotDate}` : ""}
            {" · "}Prior {priorRange.from} → {priorRange.to}
          </p>
        </div>

        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Stores">
            <button
              type="button"
              className={cn("pc-pill", allSelected && "is-active")}
              onClick={selectAllStores}
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "pc-pill",
                  selectedStoreIds.includes(s.id) && "is-active"
                )}
                aria-pressed={selectedStoreIds.includes(s.id)}
                title={s.name}
                onClick={() => toggleStore(s.id)}
              >
                {shortStoreLabel(s.name)}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">Sales window</p>
        <div className="pc-pill-row">
          {SOLD_VS_STOCK_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => navigatePreset(opt.value)}
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

      <section className="svs-summary-grid">
        <div className="svs-stat">
          <p className="svs-stat-label">Models</p>
          <p className="svs-stat-value">{pcFmtN(summary.models, 0)}</p>
        </div>
        <div className="svs-stat">
          <p className="svs-stat-label">Sold</p>
          <p className="svs-stat-value">{pcFmtN(summary.sold, 0)}</p>
        </div>
        <div className="svs-stat">
          <p className="svs-stat-label">On lot</p>
          <p className="svs-stat-value">{pcFmtN(summary.onLot, 0)}</p>
        </div>
        <div className="svs-stat need-more">
          <p className="svs-stat-label">Need more</p>
          <p className="svs-stat-value">{pcFmtN(summary.needMore, 0)}</p>
        </div>
        <div className="svs-stat too-much">
          <p className="svs-stat-label">Too much</p>
          <p className="svs-stat-value">{pcFmtN(summary.tooMuch, 0)}</p>
        </div>
        <div className="svs-stat balanced">
          <p className="svs-stat-label">Balanced</p>
          <p className="svs-stat-value">{pcFmtN(summary.balanced, 0)}</p>
        </div>
      </section>

      <section className="svs-highlights">
        <HighlightCard
          title="Buy signals — need more"
          rows={needMoreTop}
          empty="No understocked models in this window."
        />
        <HighlightCard
          title="Ease off — too much stock"
          rows={tooMuchTop}
          empty="No overstocked models in this window."
        />
      </section>

      <section className="pc-panel svs-filters">
        <div className="svs-filter-row">
          <div className="pc-pill-row" role="group" aria-label="Action filter">
            {(
              [
                ["all", "All"],
                ["need_more", "Need more"],
                ["too_much", "Too much"],
                ["balanced", "Balanced"],
                ["watch", "Watch"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "pc-pill is-soft",
                  actionFilter === value && "is-active"
                )}
                onClick={() => setActionFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search make / model…"
            className="svs-search"
            aria-label="Search make or model"
          />
        </div>
        <p className="pc-meta" style={{ marginTop: "0.5rem" }}>
          Gap = sold − on lot (positive means short vs rooftop sales). Coverage =
          on lot ÷ sold. Expand a model for year, then trim.
        </p>
      </section>

      <section className="pc-panel svs-table-wrap">
        {filtered.length === 0 ? (
          <p className="pc-meta">No models match the current filters.</p>
        ) : (
          <div className="svs-scroll">
            <table className="svs-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={cn(col.numeric && "num")}
                      aria-sort={
                        sortKey === col.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className={cn(
                          "svs-sort-btn",
                          col.numeric && "num",
                          sortKey === col.key && "is-active"
                        )}
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortMarker(sortKey, col.key, sortDir)}
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const open = expandedModels.has(row.key);
                  const profitHref = modelCohortHref(row.make, row.model, {
                    preset: profitPresetFor(preset),
                    storeId:
                      selectedStoreIds.length === 1
                        ? selectedStoreIds[0]
                        : "all",
                  });
                  return (
                    <Fragment key={row.key}>
                      <tr className={cn("svs-row", row.action)}>
                        <td>
                          <div className="svs-name-cell">
                            <button
                              type="button"
                              className="svs-expand"
                              aria-expanded={open}
                              onClick={() => toggleModel(row.key)}
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div>
                              <div className="svs-model-name">{row.label}</div>
                              <p className="svs-why">{row.why}</p>
                            </div>
                          </div>
                        </td>
                        <td className="num">
                          <div className="svs-sold-cell">
                            {pcFmtN(row.sold, 0)}
                            <Velocity delta={row.velocityDelta} />
                          </div>
                        </td>
                        <td className="num">{pcFmtN(row.onLot, 0)}</td>
                        <td className="num">
                          {row.gap > 0 ? `+${row.gap}` : row.gap}
                        </td>
                        <td className="num">{formatCoverage(row.coverage)}</td>
                        <td className="num">
                          {formatDays(row.daysToStockout)}
                        </td>
                        <td className="num">
                          {row.avgAge == null
                            ? "—"
                            : `${pcFmtN(row.avgAge, 0)}d`}
                          {row.over45 > 0 ? (
                            <span className="svs-aged">
                              {" "}
                              · {row.over45} aged
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{pcFmt$(row.avgFront)}</td>
                        <td className="num">{pcFmt$(row.avgBack)}</td>
                        <td className="num">{pcFmt$(row.avgTotal)}</td>
                        <td>
                          <span className={ACTION_META[row.action].chip}>
                            {ACTION_META[row.action].label}
                          </span>
                        </td>
                        <td className="svs-links">
                          <Link href={profitHref} className="pc-link">
                            Profit
                          </Link>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="svs-child-wrap">
                          <td colSpan={12}>
                            <ChildTable
                              rows={row.years}
                              depth="year"
                              expanded={expandedYears}
                              toggle={toggleYear}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="pc-meta svs-footnote">
        Retail closed pre-owned deals only. On-lot excludes wholesale
        disposition. Coverage is rooftop-specific (your sales vs your stock),
        not market MDS.
      </p>
    </div>
  );
}
