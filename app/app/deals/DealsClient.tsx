"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Deal = {
  id: string;
  sale_date: string;
  status: string;
  customer_last_name: string;
  stock_number: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  store_id: string;
  department_id: string;
  front_profit: number | null;
  back_profit: number | null;
  finance_type: string | null;
  finance_manager_id: string | null;
};

type Store = { id: string; name: string };
type DeptRow = { id: string; name: string; store_id: string };
type PersonRow = { id: string; name: string; store_id: string };
type DealSalesperson = { deal_id: string; salesperson_id: string };

type SortCol =
  | "sale_date"
  | "stock_number"
  | "customer_last_name"
  | "status"
  | "front_profit"
  | "back_profit"
  | "total_gross";

type StatusFilter = "all" | "pending" | "delivered" | "closed" | "dead" | "unwound";

interface Props {
  stores: Store[];
  deals: Deal[];
  departments: DeptRow[];
  salespeople: PersonRow[];
  financeManagers: PersonRow[];
  dealSalespeople: DealSalesperson[];
  initialYear: number;
  initialMonth: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_OPTIONS: { value: StatusFilter; label: string; activeClass: string }[] = [
  { value: "all",       label: "All",       activeClass: "bg-slate-700 text-white" },
  { value: "pending",   label: "Pending",   activeClass: "bg-amber-500 text-white" },
  { value: "delivered", label: "Delivered", activeClass: "bg-blue-500 text-white" },
  { value: "closed",    label: "Closed",    activeClass: "bg-emerald-600 text-white" },
  { value: "dead",      label: "Dead",      activeClass: "bg-slate-500 text-white" },
  { value: "unwound",   label: "Unwound",   activeClass: "bg-red-500 text-white" },
];

const FINANCE_TYPES = [
  { value: "", label: "All Finance Types" },
  { value: "prime", label: "Prime" },
  { value: "subprime", label: "Subprime" },
  { value: "lease", label: "Lease" },
  { value: "cash", label: "Cash" },
];

const SEL =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const fmt$ = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-700",
    delivered: "bg-blue-100 text-blue-700",
    closed:    "bg-emerald-100 text-emerald-700",
    dead:      "bg-slate-100 text-slate-600",
    unwound:   "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        cfg[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function Pill({
  label,
  active,
  onClick,
  activeClass = "bg-blue-600 text-white",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active ? activeClass : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function SortHeader({
  col,
  label,
  right = false,
  sortCol,
  sortDir,
  onSort,
}: {
  col: SortCol;
  label: string;
  right?: boolean;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  const indicator = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex w-full items-center ${right ? "justify-end" : ""} text-xs font-semibold uppercase tracking-wide transition-colors ${
        active ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {label}{indicator}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DealsClient({
  stores,
  deals,
  departments,
  salespeople,
  financeManagers,
  dealSalespeople,
  initialYear,
  initialMonth,
}: Props) {
  // ── Filter state ─────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storeFilter, setStoreFilter] = useState<"both" | string>(
    stores.length === 1 ? stores[0].id : "both"
  );
  const [allTime, setAllTime] = useState(false);
  const [yearFilter, setYearFilter] = useState(initialYear);
  const [monthFilter, setMonthFilter] = useState(initialMonth);
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [financeManagerFilter, setFinanceManagerFilter] = useState("");
  const [financeTypeFilter, setFinanceTypeFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  // ── Sort state ───────────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<SortCol>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // ── Available years from data ─────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const ys = new Set(deals.map((d) => parseInt(d.sale_date.slice(0, 4), 10)));
    ys.add(initialYear);
    return Array.from(ys).sort((a, b) => b - a);
  }, [deals, initialYear]);

  // ── Filter + sort (all client-side, no refetch) ──────────────────────────
  const { filteredDeals, storeById, deptById, dealSpNameMap } = useMemo(() => {
    // Lookup maps
    const storeById = new Map(stores.map((s) => [s.id, s.name]));
    const deptById = new Map(departments.map((d) => [d.id, d.name]));
    const spById = new Map(salespeople.map((sp) => [sp.id, sp.name]));

    // deal → salesperson names + IDs
    const dealSpNameMap = new Map<string, string[]>();
    const dealSpIdMap = new Map<string, string[]>();
    for (const ds of dealSalespeople) {
      const names = dealSpNameMap.get(ds.deal_id) ?? [];
      names.push(spById.get(ds.salesperson_id) ?? "Unknown");
      dealSpNameMap.set(ds.deal_id, names);

      const ids = dealSpIdMap.get(ds.deal_id) ?? [];
      ids.push(ds.salesperson_id);
      dealSpIdMap.set(ds.deal_id, ids);
    }

    const search = searchText.toLowerCase().trim();

    const filtered = deals.filter((deal) => {
      if (statusFilter !== "all" && deal.status !== statusFilter) return false;
      if (storeFilter !== "both" && deal.store_id !== storeFilter) return false;
      if (!allTime) {
        const y = parseInt(deal.sale_date.slice(0, 4), 10);
        const m = parseInt(deal.sale_date.slice(5, 7), 10);
        if (y !== yearFilter || m !== monthFilter) return false;
      }
      if (salespersonFilter && !dealSpIdMap.get(deal.id)?.includes(salespersonFilter))
        return false;
      if (financeManagerFilter && deal.finance_manager_id !== financeManagerFilter)
        return false;
      if (financeTypeFilter && deal.finance_type !== financeTypeFilter) return false;
      if (
        search &&
        !deal.stock_number.toLowerCase().includes(search) &&
        !deal.customer_last_name.toLowerCase().includes(search)
      )
        return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let val = 0;
      switch (sortCol) {
        case "sale_date":
          val = a.sale_date.localeCompare(b.sale_date);
          break;
        case "stock_number":
          val = a.stock_number.localeCompare(b.stock_number);
          break;
        case "customer_last_name":
          val = a.customer_last_name.localeCompare(b.customer_last_name);
          break;
        case "status":
          val = a.status.localeCompare(b.status);
          break;
        case "front_profit":
          val = (a.front_profit ?? -Infinity) - (b.front_profit ?? -Infinity);
          break;
        case "back_profit":
          val = (a.back_profit ?? -Infinity) - (b.back_profit ?? -Infinity);
          break;
        case "total_gross": {
          const aT = (a.front_profit ?? 0) + (a.back_profit ?? 0);
          const bT = (b.front_profit ?? 0) + (b.back_profit ?? 0);
          val = aT - bT;
          break;
        }
      }
      return sortDir === "asc" ? val : -val;
    });

    return { filteredDeals: sorted, storeById, deptById, dealSpNameMap };
  }, [
    deals,
    stores,
    departments,
    salespeople,
    dealSalespeople,
    statusFilter,
    storeFilter,
    allTime,
    yearFilter,
    monthFilter,
    salespersonFilter,
    financeManagerFilter,
    financeTypeFilter,
    searchText,
    sortCol,
    sortDir,
  ]);

  // Grid template — Store column only when Both is selected
  const showStore = storeFilter === "both";
  const TGRID = showStore
    ? "xl:grid-cols-[65px_80px_110px_1fr_90px_100px_115px_90px_68px_68px_76px_20px] xl:gap-2"
    : "xl:grid-cols-[65px_80px_110px_1fr_100px_115px_90px_68px_68px_76px_20px] xl:gap-2";

  return (
    <div className="space-y-5">
      {/* Page header */}
      <section className="app-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-kicker">Sales Registry</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Sales Registry
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {deals.length} total deals · click any row to open and update
            </p>
          </div>
          <Button asChild>
            <Link href="/app/deals/new" prefetch>
              + Log Transaction
            </Link>
          </Button>
        </div>
      </section>

      {/* Filters */}
      <section className="app-panel space-y-4 p-5">
        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(({ value, label, activeClass }) => (
            <Pill
              key={value}
              label={label}
              active={statusFilter === value}
              activeClass={activeClass}
              onClick={() => setStatusFilter(value)}
            />
          ))}
        </div>

        {/* Store pills */}
        <div className="flex flex-wrap gap-1.5">
          <Pill
            label="Both Stores"
            active={storeFilter === "both"}
            onClick={() => setStoreFilter("both")}
          />
          {stores.map((store) => (
            <Pill
              key={store.id}
              label={store.name}
              active={storeFilter === store.id}
              onClick={() => setStoreFilter(store.id)}
            />
          ))}
        </div>

        {/* Date + dropdowns */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Month / Year / All time */}
          <div className="flex items-center gap-2">
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(Number(e.target.value));
                setAllTime(false);
              }}
              disabled={allTime}
              className={`${SEL} flex-1`}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(Number(e.target.value));
                setAllTime(false);
              }}
              disabled={allTime}
              className="h-9 w-[76px] shrink-0 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAllTime((v) => !v)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                allTime
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All time
            </button>
          </div>

          {/* Salesperson */}
          <select
            value={salespersonFilter}
            onChange={(e) => setSalespersonFilter(e.target.value)}
            className={SEL}
          >
            <option value="">All Salespeople</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </select>

          {/* Finance Manager */}
          <select
            value={financeManagerFilter}
            onChange={(e) => setFinanceManagerFilter(e.target.value)}
            className={SEL}
          >
            <option value="">All Finance Managers</option>
            {financeManagers.map((fm) => (
              <option key={fm.id} value={fm.id}>
                {fm.name}
              </option>
            ))}
          </select>

          {/* Finance Type */}
          <select
            value={financeTypeFilter}
            onChange={(e) => setFinanceTypeFilter(e.target.value)}
            className={SEL}
          >
            {FINANCE_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search stock # or customer last name…"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </section>

      {/* Table */}
      <section className="w-full min-w-0 rounded-2xl border border-[#e7ebf3] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        {/* Count bar */}
        <div className="flex items-center justify-between border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Deals
          </p>
          <p className="text-xs text-slate-500">
            Showing {filteredDeals.length} of {deals.length}
          </p>
        </div>

        {/* Column headers — xl+ only */}
        <div
          className={`hidden border-b border-[#edf1f7] bg-[#f8fafd] px-5 py-2 xl:grid ${TGRID}`}
        >
          <SortHeader col="sale_date" label="Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <SortHeader col="stock_number" label="Stock #" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <SortHeader col="customer_last_name" label="Customer" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vehicle</span>
          {showStore && (
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Store</span>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dept</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Salesperson</span>
          <SortHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <SortHeader col="front_profit" label="Front" right sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <SortHeader col="back_profit" label="Back" right sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <SortHeader col="total_gross" label="Total" right sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
          <span />
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#edf1f7]">
          {filteredDeals.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              No deals match these filters.
            </p>
          ) : (
            filteredDeals.map((deal) => {
              const spNames = dealSpNameMap.get(deal.id) ?? [];
              const storeName = storeById.get(deal.store_id) ?? "—";
              const deptName = deptById.get(deal.department_id) ?? "—";
              const hasGross =
                deal.front_profit !== null || deal.back_profit !== null;
              const totalGross = hasGross
                ? (deal.front_profit ?? 0) + (deal.back_profit ?? 0)
                : null;

              return (
                <Link
                  key={deal.id}
                  href={`/app/deals/${deal.id}/edit`}
                  prefetch
                  className={`group flex min-w-0 flex-col px-5 py-3 transition-colors hover:bg-[#f5f8ff] xl:grid ${TGRID} xl:items-center`}
                >
                  {/* Date — always visible, grid cell 1 */}
                  <span className="text-sm text-slate-400">
                    {formatDate(deal.sale_date)}
                  </span>

                  {/* Stock # — always visible, grid cell 2 */}
                  <span className="font-mono text-sm font-semibold text-blue-700">
                    {deal.stock_number}
                  </span>

                  {/* Customer — always visible, grid cell 3 */}
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                    {deal.customer_last_name}
                  </span>

                  {/* Vehicle — always visible, grid cell 4 (1fr) */}
                  <span className="min-w-0 truncate text-sm text-slate-600">
                    {deal.vehicle_year} {deal.vehicle_make} {deal.vehicle_model}
                  </span>

                  {/* Stacked summary — hidden at xl+, not a grid cell */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 xl:hidden">
                    <StatusBadge status={deal.status} />
                    {showStore && <span>{storeName}</span>}
                    <span>{deptName}</span>
                    {spNames.length > 0 && <span>{spNames.join(", ")}</span>}
                    {totalGross !== null && (
                      <span className="font-medium text-slate-600">
                        {fmt$(totalGross)}
                      </span>
                    )}
                  </div>

                  {/* Store — xl+, Both mode only */}
                  {showStore && (
                    <span className="hidden text-sm text-slate-500 xl:block">
                      {storeName}
                    </span>
                  )}

                  {/* Dept */}
                  <span className="hidden text-sm text-slate-500 xl:block">
                    {deptName}
                  </span>

                  {/* Salesperson(s) */}
                  <span className="hidden text-sm text-slate-500 xl:block">
                    {spNames.length > 0 ? spNames.join(", ") : "—"}
                  </span>

                  {/* Status badge */}
                  <span className="hidden xl:block">
                    <StatusBadge status={deal.status} />
                  </span>

                  {/* Front */}
                  <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                    {deal.front_profit !== null ? fmt$(deal.front_profit) : "—"}
                  </span>

                  {/* Back */}
                  <span className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
                    {deal.back_profit !== null ? fmt$(deal.back_profit) : "—"}
                  </span>

                  {/* Total */}
                  <span className="hidden text-right text-sm tabular-nums font-semibold text-slate-800 xl:block">
                    {totalGross !== null ? fmt$(totalGross) : "—"}
                  </span>

                  {/* Chevron */}
                  <ChevronRight className="hidden h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-400 xl:block" />
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
