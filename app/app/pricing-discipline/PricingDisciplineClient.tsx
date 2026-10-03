"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DATE_PRESET_OPTIONS,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import { pcFmt$, pcFmtN, pcFmtPct } from "@/lib/profit-center/format";
import type {
  PricingDeal,
  PricingDealSalesperson,
  PricingDepartment,
  PricingTrade,
} from "@/lib/pricing-discipline/load";
import {
  DISPOSITION_MATCH_LABEL,
  LIST_PRICE_SOURCE_LABEL,
  POM_BANDS,
  dealDiscount,
  dealDiscountPct,
  dispositionMatch,
  formatDisposition,
  formatFinanceTypeLabel,
  groupStats,
  pomBand,
  summarize,
  tradeOverAllowance,
  type DispositionMatch,
  type ListPriceSource,
  type PricingGroupStats,
} from "@/lib/pricing-discipline/metrics";
import { setDealListPriceOverride } from "@/app/app/deals/actions";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };

type SourceFilter = "locked" | "all" | ListPriceSource;
type MatchFilter = "all" | "match" | "mismatch";
type SortKey = "sale_date" | "discount" | "discountPct" | "pom" | "front" | "age";

type Filters = {
  storeId: string;
  departmentId: string;
  salespersonId: string;
  financeType: string;
  disp: string;
  match: MatchFilter;
  source: SourceFilter;
};

const EMPTY_FILTERS: Omit<Filters, "storeId"> = {
  departmentId: "all",
  salespersonId: "all",
  financeType: "all",
  disp: "all",
  match: "all",
  source: "locked",
};

const FINANCE_COLS = ["prime", "subprime", "cash", "lease"] as const;
const DISP_ROWS = ["retail", "subprime", "wholesale"] as const;
const PRIME_CASH_TYPES = new Set(["prime", "cash", "lease"]);
const PAGE = 200;

interface Props {
  stores: Store[];
  departments: PricingDepartment[];
  deals: PricingDeal[];
  dealSalespeople: PricingDealSalesperson[];
  trades: PricingTrade[];
  salespeople: Salesperson[];
  missingDeals: PricingDeal[];
  canOverride: boolean;
  groupName: string;
  preset: DatePreset;
  range: DateRange;
  initialStoreId: string;
}

function vehicleLabel(d: PricingDeal): string {
  return [d.vehicle_year, d.vehicle_make, d.vehicle_model, d.trim]
    .filter((p) => p != null && String(p).trim() !== "")
    .join(" ");
}

function matchClass(m: DispositionMatch): string {
  if (m === "match") return "text-emerald-500";
  if (m === "unknown") return "text-[var(--da-muted)]";
  return "text-amber-500";
}

function discountClass(v: number | null): string {
  if (v == null) return "text-[var(--da-muted)]";
  return v > 0 ? "text-red-500" : "text-emerald-500";
}

export default function PricingDisciplineClient({
  stores,
  departments,
  deals,
  dealSalespeople,
  trades,
  salespeople,
  missingDeals: initialMissing,
  canOverride,
  groupName,
  preset,
  range,
  initialStoreId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const [filters, setFilters] = useState<Filters>({
    storeId: initialStoreId,
    ...EMPTY_FILTERS,
  });
  const [sortKey, setSortKey] = useState<SortKey>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visible, setVisible] = useState(PAGE);
  const [missing, setMissing] = useState(initialMissing);

  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const spName = useMemo(
    () => new Map(salespeople.map((s) => [s.id, s.name])),
    [salespeople]
  );

  const spByDeal = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of dealSalespeople) {
      const list = m.get(r.deal_id) ?? [];
      list.push(r.salesperson_id);
      m.set(r.deal_id, list);
    }
    return m;
  }, [dealSalespeople]);

  const tradesByDeal = useMemo(() => {
    const m = new Map<string, PricingTrade[]>();
    for (const t of trades) {
      const list = m.get(t.deal_id) ?? [];
      list.push(t);
      m.set(t.deal_id, list);
    }
    return m;
  }, [trades]);

  const deptOptions = useMemo(
    () =>
      departments.filter(
        (d) => filters.storeId === "all" || d.store_id === filters.storeId
      ),
    [departments, filters.storeId]
  );

  const spOptions = useMemo(
    () =>
      salespeople
        .filter((s) => filters.storeId === "all" || s.store_id === filters.storeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [salespeople, filters.storeId]
  );

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (filters.storeId !== "all" && d.store_id !== filters.storeId) return false;
      if (filters.departmentId !== "all" && d.department_id !== filters.departmentId)
        return false;
      if (
        filters.salespersonId !== "all" &&
        !(spByDeal.get(d.id) ?? []).includes(filters.salespersonId)
      )
        return false;
      if (filters.financeType !== "all" && d.finance_type !== filters.financeType)
        return false;
      if (filters.disp !== "all") {
        if (filters.disp === "unknown" ? d.sale_inv_disp != null : d.sale_inv_disp !== filters.disp)
          return false;
      }
      if (filters.match !== "all") {
        const m = dispositionMatch(d.sale_inv_disp, d.finance_type);
        if (filters.match === "match" && m !== "match") return false;
        if (filters.match === "mismatch" && (m === "match" || m === "unknown")) return false;
      }
      if (filters.source === "locked") {
        if (d.list_price_source !== "inventory_snapshot" && d.list_price_source !== "manual")
          return false;
      } else if (filters.source !== "all" && d.list_price_source !== filters.source) {
        return false;
      }
      return true;
    });
  }, [deals, filters, spByDeal]);

  const summary = useMemo(() => summarize(filtered), [filtered]);

  const salespersonRows = useMemo(() => {
    const groups = new Map<string, PricingDeal[]>();
    for (const d of filtered) {
      const ids = spByDeal.get(d.id) ?? ["(none)"];
      for (const id of ids) {
        const list = groups.get(id) ?? [];
        list.push(d);
        groups.set(id, list);
      }
    }
    return [...groups.entries()]
      .map(([id, list]) => ({
        id,
        name: id === "(none)" ? "(No salesperson)" : spName.get(id) ?? "Unknown",
        ...groupStats(list),
      }))
      .sort((a, b) => b.totalDiscount - a.totalDiscount);
  }, [filtered, spByDeal, spName]);

  const pomPrimeCash = useMemo(
    () => filtered.filter((d) => d.finance_type != null && PRIME_CASH_TYPES.has(d.finance_type)),
    [filtered]
  );
  const pomSubprime = useMemo(
    () => filtered.filter((d) => d.finance_type === "subprime"),
    [filtered]
  );

  const dispGrid = useMemo(() => {
    const cells = new Map<string, PricingDeal[]>();
    for (const d of filtered) {
      const key = `${d.sale_inv_disp ?? "unknown"}|${d.finance_type ?? "unknown"}`;
      const list = cells.get(key) ?? [];
      list.push(d);
      cells.set(key, list);
    }
    return cells;
  }, [filtered]);

  const sorted = useMemo(() => {
    const val = (d: PricingDeal): number | string | null => {
      switch (sortKey) {
        case "sale_date":
          return d.sale_date;
        case "discount":
          return dealDiscount(d);
        case "discountPct":
          return dealDiscountPct(d);
        case "pom":
          return d.sale_pom;
        case "front":
          return d.front_profit;
        case "age":
          return d.age;
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filtered, sortKey, sortDir]);

  const visibleMissing = useMemo(
    () =>
      missing.filter((d) => filters.storeId === "all" || d.store_id === filters.storeId),
    [missing, filters.storeId]
  );

  function navigatePreset(next: DatePreset) {
    if (next === preset) return;
    const params = new URLSearchParams();
    params.set("preset", next);
    if (filters.storeId !== "all") params.set("store", filters.storeId);
    startNav(() => router.push(`${pathname}?${params.toString()}`));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortLabel(key: SortKey, label: string) {
    return (
      <button type="button" className="pc-sort" onClick={() => toggleSort(key)}>
        {label}
        {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  const selectedStore =
    filters.storeId === "all" ? null : stores.find((s) => s.id === filters.storeId) ?? null;
  const title =
    selectedStore?.name ?? (stores.length > 1 ? "All Stores" : groupName || "Pricing Discipline");

  return (
    <div className="pc-command space-y-4">
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Pricing discipline</p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01" ? "All time" : `${range.from} → ${range.to}`}
            {" · "}
            {filtered.length.toLocaleString()} closed pre-owned deal
            {filtered.length === 1 ? "" : "s"}
            {" · "}
            {pcFmt$(summary.totalDiscount)} gross given up vs list
          </p>
        </div>
        {stores.length > 1 && (
          <div className="pc-store-pills" role="group" aria-label="Store">
            <button
              type="button"
              className={cn("pc-pill", filters.storeId === "all" && "is-active")}
              onClick={() =>
                setFilters((f) => ({ ...f, storeId: "all", departmentId: "all", salespersonId: "all" }))
              }
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn("pc-pill", filters.storeId === s.id && "is-active")}
                onClick={() =>
                  setFilters((f) => ({ ...f, storeId: s.id, departmentId: "all", salespersonId: "all" }))
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="pc-panel">
        <p className="pc-panel-label">
          Date range{navPending ? " · Loading…" : ""}
        </p>
        <div className={cn("pc-pill-row", navPending && "is-loading")} aria-busy={navPending}>
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={navPending}
              onClick={() => navigatePreset(opt.value)}
              className={cn("pc-pill is-soft", preset === opt.value && "is-active")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {visibleMissing.length > 0 && (
        <MissingListPriceQueue
          deals={visibleMissing}
          storeName={storeName}
          canOverride={canOverride}
          onResolved={(id) => setMissing((prev) => prev.filter((d) => d.id !== id))}
        />
      )}

      <section className="pc-panel space-y-3">
        <p className="pc-panel-label">Filters</p>
        <div className="pc-filters">
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}
          >
            <option value="all">All pre-owned departments</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {stores.length > 1 && filters.storeId === "all"
                  ? `${d.name} · ${storeName.get(d.store_id) ?? ""}`
                  : d.name}
              </option>
            ))}
          </select>
          <select
            value={filters.salespersonId}
            onChange={(e) => setFilters((f) => ({ ...f, salespersonId: e.target.value }))}
          >
            <option value="all">All salespeople</option>
            {spOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filters.financeType}
            onChange={(e) => setFilters((f) => ({ ...f, financeType: e.target.value }))}
          >
            <option value="all">All finance types</option>
            <option value="prime">Prime</option>
            <option value="subprime">Subprime</option>
            <option value="cash">Cash</option>
            <option value="lease">Lease</option>
          </select>
          <select
            value={filters.disp}
            onChange={(e) => setFilters((f) => ({ ...f, disp: e.target.value }))}
          >
            <option value="all">All planned dispositions</option>
            <option value="retail">Planned Prime</option>
            <option value="subprime">Planned Subprime</option>
            <option value="wholesale">Planned Wholesale</option>
            <option value="unknown">No disposition</option>
          </select>
          <select
            value={filters.match}
            onChange={(e) => setFilters((f) => ({ ...f, match: e.target.value as MatchFilter }))}
          >
            <option value="all">Match + mismatch</option>
            <option value="match">Disposition matched</option>
            <option value="mismatch">Disposition mismatched</option>
          </select>
          <select
            value={filters.source}
            onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as SourceFilter }))}
          >
            <option value="locked">Inventory + admin list prices</option>
            <option value="inventory_snapshot">Inventory only</option>
            <option value="manual">Manual (admin) only</option>
            <option value="missing">Missing list price</option>
            <option value="legacy">Legacy (typed, pre-inventory)</option>
            <option value="all">All sources</option>
          </select>
        </div>
        <button
          type="button"
          className="pc-link"
          onClick={() => setFilters((f) => ({ ...f, ...EMPTY_FILTERS }))}
        >
          Clear filters
        </button>
      </section>

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Gross given up</div>
          <div className={cn("pc-kpi-value", summary.totalDiscount > 0 ? "red" : "green")}>
            {pcFmt$(summary.totalDiscount)}
          </div>
          <div className="pc-kpi-sub">{pcFmtN(summary.pricedUnits)} deals with list price</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg discount</div>
          <div className="pc-kpi-value amber">{pcFmt$(summary.avgDiscount)}</div>
          <div className="pc-kpi-sub">
            {summary.avgDiscountPct == null ? "—" : `${summary.avgDiscountPct.toFixed(1)}% of list`}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Sold at / above list</div>
          <div className="pc-kpi-value green">{pcFmtPct(summary.atOrAboveListPct)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg % of market at sale</div>
          <div className="pc-kpi-value">
            {summary.avgPom == null ? "—" : `${summary.avgPom.toFixed(1)}%`}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Disposition match</div>
          <div className="pc-kpi-value">{pcFmtPct(summary.matchRate)}</div>
          <div className="pc-kpi-sub">planned vs finance type</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg front gross</div>
          <div className="pc-kpi-value">{pcFmt$(summary.avgFront)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Missing list price</div>
          <div className={cn("pc-kpi-value", visibleMissing.length > 0 ? "red" : "")}>
            {pcFmtN(visibleMissing.length)}
          </div>
          <div className="pc-kpi-sub">awaiting admin entry</div>
        </div>
        {summary.typedComparable > 0 && (
          <div className="pc-kpi">
            <div className="pc-kpi-label">Typed list = sale price</div>
            <div className="pc-kpi-value amber">
              {pcFmtPct((summary.typedEqualsSale / summary.typedComparable) * 100)}
            </div>
            <div className="pc-kpi-sub">
              {pcFmtN(summary.typedEqualsSale)} of {pcFmtN(summary.typedComparable)} before locking
            </div>
          </div>
        )}
      </div>

      <MarketPositioningTable
        title="Market positioning at sale — Prime & Cash"
        description="Prime, cash, and lease deals grouped by Adj % of Market on the last inventory upload. Aggressively priced units should turn faster with less discounting."
        deals={pomPrimeCash}
      />
      <MarketPositioningTable
        title="Market positioning at sale — Subprime"
        description="Subprime deals grouped by Adj % of Market on the last inventory upload. Many subprime units carry no advertised price, so fewer have a discount."
        deals={pomSubprime}
      />

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="px-4 pt-4">
          <h2 className="pc-section-title">Planned disposition vs actual exit</h2>
          <p className="pc-muted">
            Rows are the disposition on the inventory upload at sale; columns are the deal’s
            finance type. Prime plans match Prime, Cash, or Lease; Subprime plans match Subprime.
          </p>
        </div>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Planned \ Actual</th>
                {FINANCE_COLS.map((f) => (
                  <th key={f}>{formatFinanceTypeLabel(f)}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...DISP_ROWS, "unknown" as const].map((disp) => {
                const rowDeals = FINANCE_COLS.flatMap(
                  (f) => dispGrid.get(`${disp}|${f}`) ?? []
                );
                if (disp === "unknown" && rowDeals.length === 0) return null;
                return (
                  <tr key={disp}>
                    <td>{disp === "unknown" ? "No disposition" : formatDisposition(disp)}</td>
                    {FINANCE_COLS.map((f) => {
                      const cell = dispGrid.get(`${disp}|${f}`) ?? [];
                      const m = dispositionMatch(disp === "unknown" ? null : disp, f);
                      const stats = groupStats(cell);
                      return (
                        <td key={f} className={cell.length ? matchClass(m) : undefined}>
                          {cell.length ? (
                            <>
                              {pcFmtN(cell.length)}
                              <span className="pc-muted"> · {pcFmt$(stats.avgDiscount)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td>{pcFmtN(rowDeals.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="pc-footnote px-4 pb-4">
          Cells show deal count · average discount (list − sale). Amber cells are mismatches.
        </p>
      </section>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="px-4 pt-4">
          <h2 className="pc-section-title">By salesperson</h2>
        </div>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Salesperson</th>
                <th>Units</th>
                <th>Gross given up</th>
                <th>Avg discount</th>
                <th>Avg discount %</th>
                <th>At / above list</th>
                <th>Avg % of market</th>
                <th>Avg front</th>
              </tr>
            </thead>
            <tbody>
              {salespersonRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="pc-empty">
                    No deals in this cut.
                  </td>
                </tr>
              ) : (
                salespersonRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{pcFmtN(r.units)}</td>
                    <td className={discountClass(r.pricedUnits ? r.totalDiscount : null)}>
                      {r.pricedUnits ? pcFmt$(r.totalDiscount) : "—"}
                    </td>
                    <td className={discountClass(r.avgDiscount)}>{pcFmt$(r.avgDiscount)}</td>
                    <td>{r.avgDiscountPct == null ? "—" : `${r.avgDiscountPct.toFixed(1)}%`}</td>
                    <td>{pcFmtPct(r.atOrAboveListPct)}</td>
                    <td>{r.avgPom == null ? "—" : `${r.avgPom.toFixed(1)}%`}</td>
                    <td>{pcFmt$(r.avgFront)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="pc-footnote px-4 pb-4">
          Split deals count toward each salesperson on the deal.
        </p>
      </section>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="px-4 pt-4">
          <h2 className="pc-section-title">Deals</h2>
        </div>
        {sorted.length === 0 ? (
          <div className="pc-empty">
            No closed pre-owned deals in this range
            {deals.length > 0 ? " match your filters" : ""}.
          </div>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>{sortLabel("sale_date", "Date")}</th>
                  <th>Stock #</th>
                  <th style={{ textAlign: "left" }}>Vehicle</th>
                  <th style={{ textAlign: "left" }}>Salesperson</th>
                  <th>{sortLabel("age", "Age")}</th>
                  <th>List</th>
                  <th>Sale</th>
                  <th>{sortLabel("discount", "Discount")}</th>
                  <th>{sortLabel("discountPct", "Disc %")}</th>
                  <th>{sortLabel("pom", "% Mkt")}</th>
                  <th>{sortLabel("front", "Front")}</th>
                  <th>Back</th>
                  <th>Trade over-allow</th>
                  <th>Finance</th>
                  <th>Planned</th>
                  <th>Match</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, visible).map((d) => {
                  const disc = dealDiscount(d);
                  const pct = dealDiscountPct(d);
                  const m = dispositionMatch(d.sale_inv_disp, d.finance_type);
                  const overAllow = tradeOverAllowance(tradesByDeal.get(d.id) ?? []);
                  const sps = (spByDeal.get(d.id) ?? [])
                    .map((id) => spName.get(id) ?? "Unknown")
                    .join(", ");
                  return (
                    <tr key={d.id}>
                      <td>{d.sale_date}</td>
                      <td>
                        <Link href={`/app/deals/${d.id}/edit`} className="pc-link">
                          {d.stock_number ?? "—"}
                        </Link>
                      </td>
                      <td style={{ textAlign: "left" }}>{vehicleLabel(d) || "—"}</td>
                      <td style={{ textAlign: "left" }}>{sps || "—"}</td>
                      <td>{d.age == null ? "—" : d.age}</td>
                      <td>{d.list_price_na ? "NA" : pcFmt$(d.list_price)}</td>
                      <td>{pcFmt$(d.sale_price)}</td>
                      <td className={discountClass(disc)}>{pcFmt$(disc)}</td>
                      <td className={discountClass(disc)}>
                        {pct == null ? "—" : `${pct.toFixed(1)}%`}
                      </td>
                      <td>{d.sale_pom == null ? "—" : `${d.sale_pom.toFixed(1)}%`}</td>
                      <td>{pcFmt$(d.front_profit)}</td>
                      <td>{pcFmt$(d.back_profit)}</td>
                      <td className={overAllow != null && overAllow > 0 ? "text-amber-500" : undefined}>
                        {pcFmt$(overAllow)}
                      </td>
                      <td>{formatFinanceTypeLabel(d.finance_type)}</td>
                      <td>{formatDisposition(d.sale_inv_disp)}</td>
                      <td className={matchClass(m)}>{DISPOSITION_MATCH_LABEL[m]}</td>
                      <td>
                        {d.list_price_source
                          ? LIST_PRICE_SOURCE_LABEL[d.list_price_source as ListPriceSource] ??
                            d.list_price_source
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sorted.length > visible && (
          <div className="px-4 py-3">
            <button
              type="button"
              className="pc-link"
              onClick={() => setVisible((v) => v + PAGE)}
            >
              Show more ({(sorted.length - visible).toLocaleString()} remaining)
            </button>
          </div>
        )}
      </section>

      <p className="pc-footnote">
        Discount = inventory list price − sale price (positive = gross given up). List price
        and % of market come from the most recent daily inventory upload on or before the sale
        date and lock when the deal closes. Trade over-allowance (allowance − ACV) is shown
        separately because discount can be moved into the trade; it is not added to the total.
      </p>
    </div>
  );
}

function buildPomRows(deals: PricingDeal[]) {
  const groups = new Map<string, PricingDeal[]>();
  for (const d of deals) {
    const band = pomBand(d.sale_pom) ?? "none";
    const list = groups.get(band) ?? [];
    list.push(d);
    groups.set(band, list);
  }
  const rows = POM_BANDS.map((b) => ({
    key: b.key as string,
    label: b.label,
    ...groupStats(groups.get(b.key) ?? []),
  }));
  if (groups.has("none")) {
    rows.push({ key: "none", label: "No % of market", ...groupStats(groups.get("none")!) });
  }
  return rows;
}

function MarketPositioningTable({
  title,
  description,
  deals,
}: {
  title: string;
  description: string;
  deals: PricingDeal[];
}) {
  const rows = useMemo(() => buildPomRows(deals), [deals]);
  const total = useMemo(() => groupStats(deals), [deals]);

  return (
    <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div className="px-4 pt-4">
        <h2 className="pc-section-title">{title}</h2>
        <p className="pc-muted">{description}</p>
      </div>
      {deals.length === 0 ? (
        <div className="pc-empty">No deals in this cut.</div>
      ) : (
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>% of market</th>
                <th>Units</th>
                <th>Avg discount</th>
                <th>Avg discount %</th>
                <th>Gross given up</th>
                <th>At / above list</th>
                <th>Avg age</th>
                <th>Avg front</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PomRow key={r.key} label={r.label} stats={r} />
              ))}
            </tbody>
            <tfoot>
              <PomRow label="Total" stats={total} />
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function PomRow({ label, stats: r }: { label: string; stats: PricingGroupStats }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{pcFmtN(r.units)}</td>
      <td className={discountClass(r.avgDiscount)}>{pcFmt$(r.avgDiscount)}</td>
      <td>{r.avgDiscountPct == null ? "—" : `${r.avgDiscountPct.toFixed(1)}%`}</td>
      <td className={discountClass(r.pricedUnits ? r.totalDiscount : null)}>
        {r.pricedUnits ? pcFmt$(r.totalDiscount) : "—"}
      </td>
      <td>{pcFmtPct(r.atOrAboveListPct)}</td>
      <td>{r.avgAge == null ? "—" : `${r.avgAge.toFixed(0)}d`}</td>
      <td>{pcFmt$(r.avgFront)}</td>
    </tr>
  );
}

function MissingListPriceQueue({
  deals,
  storeName,
  canOverride,
  onResolved,
}: {
  deals: PricingDeal[];
  storeName: Map<string, string>;
  canOverride: boolean;
  onResolved: (id: string) => void;
}) {
  return (
    <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div className="px-4 pt-4">
        <h2 className="pc-section-title">Missing list price ({deals.length})</h2>
        <p className="pc-muted">
          Closed pre-owned deals sold on or after 10/1/26 whose stock number wasn’t found (or
          had no price) on any inventory upload. These are excluded from discount totals until a
          platform or owner admin enters the list price.
        </p>
      </div>
      <div className="pc-table-wrap">
        <table className="pc-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Stock #</th>
              <th style={{ textAlign: "left" }}>Vehicle</th>
              <th style={{ textAlign: "left" }}>Store</th>
              <th>Sale</th>
              <th>Typed list</th>
              <th>Planned</th>
              {canOverride ? <th>Set list price</th> : null}
            </tr>
          </thead>
          <tbody>
            {deals.slice(0, 100).map((d) => (
              <MissingRow
                key={d.id}
                deal={d}
                storeName={storeName.get(d.store_id) ?? ""}
                canOverride={canOverride}
                onResolved={onResolved}
              />
            ))}
          </tbody>
        </table>
      </div>
      {deals.length > 100 && (
        <p className="pc-footnote px-4 pb-4">Showing the 100 most recent of {deals.length}.</p>
      )}
    </section>
  );
}

function MissingRow({
  deal,
  storeName,
  canOverride,
  onResolved,
}: {
  deal: PricingDeal;
  storeName: string;
  canOverride: boolean;
  onResolved: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await setDealListPriceOverride({ dealId: deal.id, mode: "manual", listPrice: n });
      if (!res.ok) throw new Error(res.error);
      onResolved(deal.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{deal.sale_date}</td>
      <td>
        <Link href={`/app/deals/${deal.id}/edit`} className="pc-link">
          {deal.stock_number ?? "—"}
        </Link>
      </td>
      <td style={{ textAlign: "left" }}>{vehicleLabel(deal) || "—"}</td>
      <td style={{ textAlign: "left" }}>{storeName}</td>
      <td>{pcFmt$(deal.sale_price)}</td>
      <td>{pcFmt$(deal.list_price_entered)}</td>
      <td>{formatDisposition(deal.sale_inv_disp)}</td>
      {canOverride ? (
        <td>
          <div className="flex items-center justify-end gap-2">
            <input
              type="number"
              min={0}
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="List price"
              disabled={saving}
              className="h-8 w-28 rounded-md border border-[var(--da-line)] bg-transparent px-2 text-right text-sm"
            />
            <button
              type="button"
              className="pc-link"
              disabled={saving || !value.trim()}
              onClick={save}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {error ? <div className="text-xs text-red-500">{error}</div> : null}
        </td>
      ) : null}
    </tr>
  );
}
