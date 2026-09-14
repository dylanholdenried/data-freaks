"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DATE_PRESET_OPTIONS,
  type DatePreset,
  type DateRange,
} from "@/lib/profit-center/dateRange";
import { hasMissingBooksFlag, type SaleBooksDeal } from "@/lib/buy-box/sale-books";
import {
  computeSaleBooksKpis,
  rollupSaleBooksByModel,
} from "@/lib/buy-box/scorecard";
import { buyBoxHref, buyBoxModelDealsHref } from "@/lib/buy-box/hrefs";
import { pcFmt$, pcFmtN, pcFmtPct } from "@/lib/profit-center/format";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };

type ModelSortKey =
  | "make"
  | "model"
  | "units"
  | "avgSalePrice"
  | "avgFront"
  | "avgBack"
  | "avgSaleOverMmr"
  | "unitsWithMmr"
  | "avgSaleOverJd"
  | "unitsWithJd";

type SortDir = "asc" | "desc";

function storePillLabel(name: string) {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return jb[1].trim().toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!.toUpperCase();
  return n.toUpperCase();
}

function toneClass(v: number | null): string {
  if (v == null) return "";
  if (v > 0) return "green";
  if (v < 0) return "red";
  return "";
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

export default function BuyBoxClient({
  stores,
  deals,
  preset: initialPreset,
  range,
  initialStoreId,
  groupName,
}: {
  stores: Store[];
  deals: SaleBooksDeal[];
  departmentNamesById: Record<string, string>;
  preset: DatePreset;
  range: DateRange;
  initialStoreId: string;
  groupName: string;
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(
    initialStoreId !== "all" && stores.some((s) => s.id === initialStoreId)
      ? initialStoreId
      : "all"
  );
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [sortKey, setSortKey] = useState<ModelSortKey>("avgSaleOverMmr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const scoped = useMemo(() => {
    if (storeId === "all") return deals;
    return deals.filter((d) => d.store_id === storeId);
  }, [deals, storeId]);

  const kpis = useMemo(() => computeSaleBooksKpis(scoped), [scoped]);

  const modelRows = useMemo(() => {
    const rows = rollupSaleBooksByModel(scoped);
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "make":
          return compareText(a.make, b.make, sortDir);
        case "model":
          return compareText(a.model, b.model, sortDir);
        case "units":
          return compareNullableNumber(a.units, b.units, sortDir);
        case "avgSalePrice":
          return compareNullableNumber(a.avgSalePrice, b.avgSalePrice, sortDir);
        case "avgFront":
          return compareNullableNumber(a.avgFront, b.avgFront, sortDir);
        case "avgBack":
          return compareNullableNumber(a.avgBack, b.avgBack, sortDir);
        case "avgSaleOverMmr":
          return compareNullableNumber(a.avgSaleOverMmr, b.avgSaleOverMmr, sortDir);
        case "unitsWithMmr":
          return compareNullableNumber(a.unitsWithMmr, b.unitsWithMmr, sortDir);
        case "avgSaleOverJd":
          return compareNullableNumber(a.avgSaleOverJd, b.avgSaleOverJd, sortDir);
        case "unitsWithJd":
          return compareNullableNumber(a.unitsWithJd, b.unitsWithJd, sortDir);
        default:
          return 0;
      }
    });
  }, [scoped, sortKey, sortDir]);

  const flagged = useMemo(
    () =>
      scoped
        .filter((d) => hasMissingBooksFlag(d, { preOwned: true }))
        .sort((a, b) => b.sale_date.localeCompare(a.sale_date)),
    [scoped]
  );

  function syncUrl(next: { preset?: DatePreset; storeId?: string }) {
    const p = next.preset ?? preset;
    const s = next.storeId ?? storeId;
    router.push(buyBoxHref({ preset: p, storeId: s }));
  }

  function selectStore(next: string) {
    setStoreId(next);
    syncUrl({ storeId: next });
  }

  function selectPreset(next: DatePreset) {
    if (next === preset) return;
    setPreset(next);
    syncUrl({ preset: next });
  }

  function toggleSort(key: ModelSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "make" || key === "model" ? "asc" : "desc");
    }
  }

  const selectedStore =
    storeId === "all" ? null : stores.find((s) => s.id === storeId) ?? null;
  const title =
    selectedStore?.name ?? (stores.length > 1 ? "All Stores" : groupName || "Buy-Box");

  const sortCols: { key: ModelSortKey; label: string }[] = [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "units", label: "Units" },
    { key: "avgSalePrice", label: "Avg Sale $" },
    { key: "avgFront", label: "Avg Front" },
    { key: "avgBack", label: "Avg Back" },
    { key: "avgSaleOverMmr", label: "Avg vs MMR" },
    { key: "unitsWithMmr", label: "n MMR" },
    { key: "avgSaleOverJd", label: "Avg vs JD" },
    { key: "unitsWithJd", label: "n JD" },
  ];

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">Acquisition intelligence</p>
          <h1 className="pc-title">{title}</h1>
          <p className="pc-meta">
            Buy-Box · Sale vs books ·{" "}
            {range.from === "2000-01-01" ? "All time" : `${range.from} → ${range.to}`}
            {" · "}
            {scoped.length.toLocaleString()} pre-owned closed deal
            {scoped.length === 1 ? "" : "s"}
          </p>
          <p className="pc-meta">
            Rank models by how far sale price clears locked MMR / JD Power Clean Trade.
          </p>
        </div>
        {stores.length > 0 && (
          <div className="pc-store-pills" role="group" aria-label="Store">
            <button
              type="button"
              className={cn("pc-pill", storeId === "all" && "is-active")}
              onClick={() => selectStore("all")}
            >
              All
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn("pc-pill", storeId === s.id && "is-active")}
                onClick={() => selectStore(s.id)}
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
              onClick={() => selectPreset(opt.value)}
              className={cn("pc-pill is-soft", preset === opt.value && "is-active")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Units closed</div>
          <div className="pc-kpi-value amber">{pcFmtN(kpis.preOwnedClosed)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg sale vs MMR</div>
          <div className={cn("pc-kpi-value", toneClass(kpis.avgSaleOverMmr))}>
            {pcFmt$(kpis.avgSaleOverMmr)}
          </div>
          <div className="pc-kpi-sub">
            {kpis.withMmr} deals · {pcFmtPct(kpis.coverageMmrPct)} coverage
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg sale vs JD</div>
          <div className={cn("pc-kpi-value", toneClass(kpis.avgSaleOverJd))}>
            {pcFmt$(kpis.avgSaleOverJd)}
          </div>
          <div className="pc-kpi-sub">
            {kpis.withJd} deals · {pcFmtPct(kpis.coverageJdPct)} coverage
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg front</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgFront)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg back</div>
          <div className="pc-kpi-value">{pcFmt$(kpis.avgBack)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Missing books (7-day)</div>
          <div className={cn("pc-kpi-value", kpis.missingFlagged > 0 ? "amber" : "")}>
            {pcFmtN(kpis.missingFlagged)}
          </div>
          <div className="pc-kpi-sub">Blank books excluded from averages</div>
        </div>
      </div>

      {flagged.length > 0 ? (
        <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem 0.35rem" }}>
            <p className="pc-panel-label" style={{ margin: 0 }}>
              Missing MMR / JD — needs attention
            </p>
            <p className="pc-meta" style={{ marginTop: "0.25rem" }}>
              Flagged for 7 days after close. Enter books on the deal, or the flag drops after the
              window.
            </p>
          </div>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Sale date</th>
                  <th>Stock</th>
                  <th>Vehicle</th>
                  <th>Sale</th>
                  <th>Missing</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {flagged.map((d) => {
                  const missing: string[] = [];
                  if (d.sale_mmr == null) missing.push("MMR");
                  if (d.sale_jd == null) missing.push("JD");
                  return (
                    <tr key={d.id}>
                      <td>{d.sale_date}</td>
                      <td className="font-mono">{d.stock_number}</td>
                      <td>
                        {[d.vehicle_year, d.vehicle_make, d.vehicle_model]
                          .filter(Boolean)
                          .join(" ")}
                      </td>
                      <td>{pcFmt$(d.sale_price)}</td>
                      <td>
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          {missing.join(" · ")}
                        </span>
                      </td>
                      <td>
                        <Link href={`/app/deals/${d.id}/edit`} className="pc-link">
                          Enter books
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "0.85rem 1rem 0.35rem" }}>
          <p className="pc-panel-label" style={{ margin: 0 }}>
            Model scorecard — sale vs books
          </p>
          <p className="pc-meta" style={{ marginTop: "0.25rem" }}>
            Avg vs MMR = mean of (sale price − MMR) for deals with both values. Click headers to
            sort.
          </p>
        </div>
        {modelRows.length === 0 ? (
          <div className="pc-empty">
            No pre-owned closed deals in this range. Adjust the date range or store filter.
          </div>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {modelRows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.make}</td>
                    <td>{r.model}</td>
                    <td>{pcFmtN(r.units)}</td>
                    <td>{pcFmt$(r.avgSalePrice)}</td>
                    <td>{pcFmt$(r.avgFront)}</td>
                    <td>{pcFmt$(r.avgBack)}</td>
                    <td className={cn(toneClass(r.avgSaleOverMmr) && `is-${toneClass(r.avgSaleOverMmr)}`)}>
                      <span
                        className={cn(
                          r.avgSaleOverMmr != null && r.avgSaleOverMmr > 0 && "text-emerald-600",
                          r.avgSaleOverMmr != null && r.avgSaleOverMmr < 0 && "text-red-600"
                        )}
                      >
                        {pcFmt$(r.avgSaleOverMmr)}
                      </span>
                    </td>
                    <td>{pcFmtN(r.unitsWithMmr)}</td>
                    <td>
                      <span
                        className={cn(
                          r.avgSaleOverJd != null && r.avgSaleOverJd > 0 && "text-emerald-600",
                          r.avgSaleOverJd != null && r.avgSaleOverJd < 0 && "text-red-600"
                        )}
                      >
                        {pcFmt$(r.avgSaleOverJd)}
                      </span>
                    </td>
                    <td>{pcFmtN(r.unitsWithJd)}</td>
                    <td>
                      <Link
                        href={buyBoxModelDealsHref({
                          make: r.make,
                          model: r.model,
                          preset,
                          storeId,
                        })}
                        className="pc-link"
                      >
                        View deals
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="pc-footnote">
        Pre-owned departments only. Sale-time MMR / JD lock from the last inventory report while
        the unit was on the lot (or manual override). Separate from Profit Center
        front/back/turn/trade buy-box scoring.
      </p>
    </div>
  );
}
