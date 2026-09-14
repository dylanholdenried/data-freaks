"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import {
  hasMissingBooksFlag,
  saleOverJd,
  saleOverMmr,
  type SaleBooksDeal,
} from "@/lib/buy-box/sale-books";
import {
  formatAdjPctMkt,
  formatFinanceType,
  storeDisplayName,
} from "@/lib/buy-box/loadDeals";
import { buyBoxHref } from "@/lib/buy-box/hrefs";
import { computeSaleBooksKpis } from "@/lib/buy-box/scorecard";
import { pcFmt$, pcFmtN, pcFmtMiles } from "@/lib/profit-center/format";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };

type DealSortKey =
  | "sale_date"
  | "store"
  | "stock_number"
  | "vehicle"
  | "odometer"
  | "age"
  | "sale_pom"
  | "finance_type"
  | "list_price"
  | "sale_price"
  | "front_profit"
  | "back_profit"
  | "sale_mmr"
  | "overMmr"
  | "sale_jd"
  | "overJd";

type SortDir = "asc" | "desc";

function storePillLabel(name: string) {
  return storeDisplayName(name).toUpperCase();
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: SortDir
): number {
  const aNull = a == null || !Number.isFinite(a);
  const bNull = b == null || !Number.isFinite(b);
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const diff = (a as number) - (b as number);
  return dir === "asc" ? diff : -diff;
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

export default function BuyBoxDealsClient({
  stores,
  deals,
  departmentNamesById,
  make,
  model,
  preset,
  range,
  storeId,
  groupName,
}: {
  stores: Store[];
  deals: SaleBooksDeal[];
  departmentNamesById: Record<string, string>;
  make: string;
  model: string;
  preset: DatePreset;
  range: DateRange;
  storeId: string;
  groupName: string;
}) {
  const [sortKey, setSortKey] = useState<DealSortKey>("overMmr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const storeNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of stores) map[s.id] = storeDisplayName(s.name);
    return map;
  }, [stores]);

  const kpis = useMemo(() => computeSaleBooksKpis(deals), [deals]);

  const dealRows = useMemo(() => {
    return [...deals].sort((a, b) => {
      const vehicleA = [a.vehicle_year, a.vehicle_make, a.vehicle_model, a.trim]
        .filter(Boolean)
        .join(" ");
      const vehicleB = [b.vehicle_year, b.vehicle_make, b.vehicle_model, b.trim]
        .filter(Boolean)
        .join(" ");
      const storeA = storeNameById[a.store_id] ?? "";
      const storeB = storeNameById[b.store_id] ?? "";

      switch (sortKey) {
        case "sale_date":
          return compareText(a.sale_date, b.sale_date, sortDir);
        case "store":
          return compareText(storeA, storeB, sortDir);
        case "stock_number":
          return compareText(a.stock_number, b.stock_number, sortDir);
        case "vehicle":
          return compareText(vehicleA, vehicleB, sortDir);
        case "odometer":
          return compareNullableNumber(a.odometer, b.odometer, sortDir);
        case "age":
          return compareNullableNumber(a.age, b.age, sortDir);
        case "sale_pom":
          return compareNullableNumber(a.sale_pom, b.sale_pom, sortDir);
        case "finance_type":
          return compareText(
            formatFinanceType(a.finance_type),
            formatFinanceType(b.finance_type),
            sortDir
          );
        case "list_price":
          return compareNullableNumber(
            a.list_price_na ? null : a.list_price,
            b.list_price_na ? null : b.list_price,
            sortDir
          );
        case "sale_price":
          return compareNullableNumber(a.sale_price, b.sale_price, sortDir);
        case "front_profit":
          return compareNullableNumber(a.front_profit, b.front_profit, sortDir);
        case "back_profit":
          return compareNullableNumber(a.back_profit, b.back_profit, sortDir);
        case "sale_mmr":
          return compareNullableNumber(a.sale_mmr, b.sale_mmr, sortDir);
        case "overMmr":
          return compareNullableNumber(saleOverMmr(a), saleOverMmr(b), sortDir);
        case "sale_jd":
          return compareNullableNumber(a.sale_jd, b.sale_jd, sortDir);
        case "overJd":
          return compareNullableNumber(saleOverJd(a), saleOverJd(b), sortDir);
        default:
          return 0;
      }
    });
  }, [deals, sortKey, sortDir, storeNameById]);

  function toggleSort(key: DealSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "stock_number" ||
          key === "vehicle" ||
          key === "store" ||
          key === "finance_type"
          ? "asc"
          : "desc"
      );
    }
  }

  const selectedStore =
    storeId === "all" ? null : stores.find((s) => s.id === storeId) ?? null;
  const storeLabel =
    selectedStore?.name ?? (stores.length > 1 ? "All Stores" : groupName || "Buy-Box");

  const sortCols: { key: DealSortKey; label: string }[] = [
    { key: "sale_date", label: "Sale date" },
    { key: "store", label: "Store" },
    { key: "stock_number", label: "Stock" },
    { key: "vehicle", label: "Vehicle" },
    { key: "odometer", label: "Odometer" },
    { key: "age", label: "Age" },
    { key: "sale_pom", label: "Adj % mkt" },
    { key: "finance_type", label: "Finance" },
    { key: "list_price", label: "List" },
    { key: "sale_price", label: "Sale" },
    { key: "front_profit", label: "Front" },
    { key: "back_profit", label: "Back" },
    { key: "sale_mmr", label: "MMR" },
    { key: "overMmr", label: "vs MMR" },
    { key: "sale_jd", label: "JD Clean" },
    { key: "overJd", label: "vs JD" },
  ];

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquisition intelligence</p>
          <h1 className="pc-title">
            {make} {model}
          </h1>
          <p className="pc-meta">
            Buy-Box deals · {storeDisplayName(storeLabel)} ·{" "}
            {range.from === "2000-01-01" ? "All time" : `${range.from} → ${range.to}`}
            {" · "}
            {deals.length.toLocaleString()} deal{deals.length === 1 ? "" : "s"}
          </p>
          <p className="pc-meta">
            <Link href={buyBoxHref({ preset, storeId })} className="pc-link">
              ← Back to Buy-Box scorecard
            </Link>
          </p>
        </div>
        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Store context">
            <span className={cn("pc-pill is-active")}>
              {storeId === "all" ? "All" : storePillLabel(storeLabel)}
            </span>
          </div>
        )}
      </header>

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Units</div>
          <div className="pc-kpi-value amber">{pcFmtN(kpis.preOwnedClosed)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg vs MMR</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgSaleOverMmr)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg vs JD</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgSaleOverJd)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg front</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgFront)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg back</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgBack)}</div>
        </div>
      </div>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "0.85rem 1rem 0.35rem" }}>
          <p className="pc-panel-label" style={{ margin: 0 }}>
            Closed pre-owned deals
          </p>
          <p className="pc-meta" style={{ marginTop: "0.25rem" }}>
            Age is days in stock at close. Adj % mkt is locked from the last inventory report at
            sale. Click headers to sort.
          </p>
        </div>
        {dealRows.length === 0 ? (
          <div className="pc-empty">No deals for this model in the current filters.</div>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  {sortCols.map((col) => (
                    <th key={col.key}>
                      <button
                        type="button"
                        className="pc-sort"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dealRows.map((d) => {
                  const overMmr = saleOverMmr(d);
                  const overJd = saleOverJd(d);
                  const flaggedRow = hasMissingBooksFlag(d, { preOwned: true });
                  return (
                    <tr key={d.id}>
                      <td>{d.sale_date}</td>
                      <td>{storeNameById[d.store_id] ?? "—"}</td>
                      <td>
                        <Link href={`/app/deals/${d.id}/edit`} className="pc-link font-mono">
                          {d.stock_number}
                        </Link>
                        {flaggedRow ? (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                            style={{ marginLeft: "0.35rem" }}
                          >
                            Missing
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {[d.vehicle_year, d.vehicle_make, d.vehicle_model, d.trim]
                          .filter(Boolean)
                          .join(" ")}
                        <div className="pc-meta" style={{ marginTop: "0.1rem" }}>
                          {departmentNamesById[d.department_id] ?? ""}
                        </div>
                      </td>
                      <td>{pcFmtMiles(d.odometer)}</td>
                      <td>{d.age == null ? "—" : `${pcFmtN(d.age)}d`}</td>
                      <td>{formatAdjPctMkt(d.sale_pom)}</td>
                      <td>{formatFinanceType(d.finance_type)}</td>
                      <td>{d.list_price_na ? "NA" : pcFmt$(d.list_price)}</td>
                      <td>{pcFmt$(d.sale_price)}</td>
                      <td>{pcFmt$(d.front_profit)}</td>
                      <td>{pcFmt$(d.back_profit)}</td>
                      <td>{pcFmt$(d.sale_mmr)}</td>
                      <td>
                        <span
                          className={cn(
                            overMmr != null && overMmr > 0 && "text-emerald-600",
                            overMmr != null && overMmr < 0 && "text-red-600"
                          )}
                        >
                          {pcFmt$(overMmr)}
                        </span>
                      </td>
                      <td>{pcFmt$(d.sale_jd)}</td>
                      <td>
                        <span
                          className={cn(
                            overJd != null && overJd > 0 && "text-emerald-600",
                            overJd != null && overJd < 0 && "text-red-600"
                          )}
                        >
                          {pcFmt$(overJd)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
