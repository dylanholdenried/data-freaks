"use client";

import { useEffect, useMemo, useState } from "react";
import {
  currency,
  type DemoDeal,
  type DemoFixture,
} from "@/lib/demo/acq-auto-group";

type Props = {
  fixture: DemoFixture;
  storeId: string;
  month: number;
};

type SortKey =
  | "sale_date"
  | "stock_number"
  | "vehicle"
  | "status"
  | "front_profit"
  | "back_profit"
  | "total"
  | "age";

const PAGE_SIZE = 25;

export function DemoRegistry({ fixture, storeId, month }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [salespersonId, setSalespersonId] = useState("all");
  const [fmId, setFmId] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>(String(month));
  const [sortKey, setSortKey] = useState<SortKey>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setMonthFilter(String(month));
    setPage(1);
  }, [month]);

  const selectedStoreIds =
    storeId === "all" ? fixture.stores.map((s) => s.id) : [storeId];

  const deptById = useMemo(
    () => new Map(fixture.departments.map((d) => [d.id, d])),
    [fixture.departments]
  );
  const spById = useMemo(
    () => new Map(fixture.salespeople.map((s) => [s.id, s])),
    [fixture.salespeople]
  );
  const fmById = useMemo(
    () => new Map(fixture.financeManagers.map((f) => [f.id, f])),
    [fixture.financeManagers]
  );
  const primarySp = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of fixture.dealSalespeople) {
      if (!map.has(a.deal_id) || a.share_percent >= 50) {
        map.set(a.deal_id, a.salesperson_id);
      }
    }
    return map;
  }, [fixture.dealSalespeople]);

  const storeScopedDepts = fixture.departments.filter((d) =>
    selectedStoreIds.includes(d.store_id)
  );
  const storeScopedSp = fixture.salespeople.filter((s) =>
    selectedStoreIds.includes(s.store_id)
  );
  const storeScopedFm = fixture.financeManagers.filter((f) =>
    selectedStoreIds.includes(f.store_id)
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = fixture.deals.filter((d) => selectedStoreIds.includes(d.store_id));

    if (monthFilter !== "all") {
      const prefix = `2026-${String(monthFilter).padStart(2, "0")}`;
      rows = rows.filter((d) => d.sale_date.startsWith(prefix));
    }
    if (status !== "all") rows = rows.filter((d) => d.status === status);
    if (departmentId !== "all") rows = rows.filter((d) => d.department_id === departmentId);
    if (salespersonId !== "all") {
      rows = rows.filter((d) => primarySp.get(d.id) === salespersonId);
    }
    if (fmId !== "all") rows = rows.filter((d) => d.finance_manager_id === fmId);
    if (q) {
      rows = rows.filter((d) => {
        const sp = spById.get(primarySp.get(d.id) ?? "")?.name ?? "";
        const hay = [
          d.stock_number,
          d.vin,
          d.vehicle_make,
          d.vehicle_model,
          String(d.vehicle_year),
          sp,
          d.acquisition_source,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const sorted = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const totalA = a.front_profit + a.back_profit;
      const totalB = b.front_profit + b.back_profit;
      switch (sortKey) {
        case "sale_date":
          return a.sale_date.localeCompare(b.sale_date) * dir;
        case "stock_number":
          return a.stock_number.localeCompare(b.stock_number) * dir;
        case "vehicle":
          return `${a.vehicle_year} ${a.vehicle_make} ${a.vehicle_model}`.localeCompare(
            `${b.vehicle_year} ${b.vehicle_make} ${b.vehicle_model}`
          ) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "front_profit":
          return (a.front_profit - b.front_profit) * dir;
        case "back_profit":
          return (a.back_profit - b.back_profit) * dir;
        case "total":
          return (totalA - totalB) * dir;
        case "age":
          return (a.age - b.age) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    fixture.deals,
    selectedStoreIds,
    monthFilter,
    status,
    departmentId,
    salespersonId,
    fmId,
    search,
    primarySp,
    spById,
    sortKey,
    sortDir,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "sale_date" || key === "stock_number" ? "desc" : "desc");
    }
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setDepartmentId("all");
    setSalespersonId("all");
    setFmId("all");
    setMonthFilter(String(month));
    setPage(1);
  }

  return (
    <div className="da-demo-view">
      <div className="da-demo-panel">
        <div className="da-demo-panel-head">
          <h3>Sales Registry</h3>
          <span>
            {filtered.length.toLocaleString()} deals · page {safePage} of {pageCount}
          </span>
        </div>

        <div className="da-demo-filters">
          <label className="grow">
            <span>Search</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Stock, VIN, model, salesperson…"
            />
          </label>
          <label>
            <span>Month</span>
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All 2026</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {new Date(2026, m - 1, 1).toLocaleString("en-US", { month: "short" })} 2026
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="closed">Closed</option>
              <option value="dead">Dead</option>
              <option value="unwound">Unwound</option>
            </select>
          </label>
          <label>
            <span>Department</span>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              {storeScopedDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Salesperson</span>
            <select
              value={salespersonId}
              onChange={(e) => {
                setSalespersonId(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              {storeScopedSp.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Finance mgr</span>
            <select
              value={fmId}
              onChange={(e) => {
                setFmId(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              {storeScopedFm.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="da-btn da-btn-ghost da-demo-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="da-demo-table-scroll">
          <table className="da-demo-table dense">
            <thead>
              <tr>
                <Th k="sale_date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th
                  k="stock_number"
                  label="Stock #"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <Th k="vehicle" label="Vehicle" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th>Department</th>
                <th>Salesperson</th>
                <th>F&I</th>
                <Th k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th
                  k="front_profit"
                  label="Front"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  right
                />
                <Th
                  k="back_profit"
                  label="Back"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  right
                />
                <Th k="total" label="Total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
                <Th k="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
                <th>Source</th>
                <th>Finance</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((deal) => (
                <RegistryRow
                  key={deal.id}
                  deal={deal}
                  department={deptById.get(deal.department_id)?.name ?? "—"}
                  salesperson={spById.get(primarySp.get(deal.id) ?? "")?.name ?? "—"}
                  fm={fmById.get(deal.finance_manager_id)?.name ?? "—"}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="da-demo-pager">
          <button
            type="button"
            className="da-btn da-btn-ghost"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button
            type="button"
            className="da-btn da-btn-ghost"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({
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
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className={right ? "r" : undefined}>
      <button type="button" className="da-demo-sort" onClick={() => onSort(k)}>
        {label}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function RegistryRow({
  deal,
  department,
  salesperson,
  fm,
}: {
  deal: DemoDeal;
  department: string;
  salesperson: string;
  fm: string;
}) {
  const total = deal.front_profit + deal.back_profit;
  return (
    <tr>
      <td>{deal.sale_date}</td>
      <td className="strong">{deal.stock_number}</td>
      <td>
        {deal.vehicle_year} {deal.vehicle_make} {deal.vehicle_model}
      </td>
      <td>{department}</td>
      <td>{salesperson}</td>
      <td>{fm}</td>
      <td>
        <span className={`da-demo-status ${deal.status}`}>{deal.status}</span>
      </td>
      <td className={`r ${deal.front_profit < 0 ? "bad" : "good"}`}>
        {currency(deal.front_profit)}
      </td>
      <td className="r">{currency(deal.back_profit)}</td>
      <td className={`r strong ${total < 0 ? "bad" : ""}`}>{currency(total)}</td>
      <td className="r">{deal.age}d</td>
      <td>{deal.acquisition_source}</td>
      <td>{deal.finance_type}</td>
    </tr>
  );
}
