"use client";

import { Fragment, useMemo, useState } from "react";
import type {
  AcqKpiRollup,
  SourceTreeRow,
} from "@/lib/acquire/performance-analytics";
import { fmt$, fmtN, fmtPct } from "@/app/app/profit-center/format";

type SortKey =
  | "label"
  | "soldCount"
  | "retailCount"
  | "avgFront"
  | "avgBack"
  | "avgTotal"
  | "avgTurn"
  | "tradePct"
  | "wholesalePct"
  | "avgWholesaleGross"
  | "avgRecon"
  | "avgVariance";

function signedMoney(n: number | null): string {
  if (n == null) return "—";
  const base = fmt$(n);
  return n > 0 ? `+${base}` : base;
}

function signedPct(n: number | null): string {
  if (n == null) return "—";
  const pct = Math.round(n * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function moneyTone(n: number | null): string | undefined {
  if (n == null || n === 0) return undefined;
  return n > 0 ? "var(--da-green)" : "var(--da-red)";
}

function varianceTone(n: number | null): string | undefined {
  if (n == null || n === 0) return undefined;
  return n > 0 ? "var(--da-red)" : "var(--da-green)";
}

function sortValue(row: AcqKpiRollup, key: SortKey): number | string {
  switch (key) {
    case "label":
      return row.label;
    case "avgRecon":
      return row.recon.avgRecon ?? -Infinity;
    case "avgVariance":
      return row.recon.avgVariance ?? -Infinity;
    default:
      return (row[key] as number | null) ?? -Infinity;
  }
}

function MetricCells({ row }: { row: AcqKpiRollup }) {
  return (
    <>
      <td>{fmtN(row.soldCount)}</td>
      <td>{fmtN(row.retailCount)}</td>
      <td>{fmt$(row.avgFront)}</td>
      <td>{fmt$(row.avgBack)}</td>
      <td>{fmt$(row.avgTotal)}</td>
      <td>{row.avgTurn == null ? "—" : `${fmtN(row.avgTurn, 0)}d`}</td>
      <td>{fmtPct(row.tradePct)}</td>
      <td>{fmtPct(row.wholesalePct)}</td>
      <td style={{ color: moneyTone(row.avgWholesaleGross) }}>
        {fmt$(row.avgWholesaleGross)}
      </td>
      <td>{fmt$(row.recon.avgRecon)}</td>
      <td style={{ color: varianceTone(row.recon.avgVariance) }}>
        {signedMoney(row.recon.avgVariance)}
      </td>
      <td style={{ color: varianceTone(row.recon.avgVariancePct) }}>
        {signedPct(row.recon.avgVariancePct)}
      </td>
    </>
  );
}

export default function SourcesTab({ rows }: { rows: SourceTreeRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("avgTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = typeof av === "number" ? av : -Infinity;
      const bn = typeof bv === "number" ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "label" ? "asc" : "desc");
    }
  }

  function mark(k: SortKey) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const th = (k: SortKey, label: string) => (
    <th>
      <button type="button" className="pc-sort" onClick={() => toggleSort(k)}>
        {label}
        {mark(k)}
      </button>
    </th>
  );

  return (
    <section className="pc-stocking">
      <div className="pc-buybox-head">
        <h2>Acquisition sources</h2>
        <p>
          Expand a source to see sellers (OVE, Smart Auction, etc.). Retail
          averages exclude wholesale.
        </p>
      </div>

      <div className="pc-pill-row" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="pc-pill is-soft"
          onClick={() => setExpanded(new Set(rows.map((r) => r.key)))}
        >
          Expand all
        </button>
        <button
          type="button"
          className="pc-pill is-soft"
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="pc-muted">No sold purchases in this cut.</p>
      ) : (
        <div className="pc-table-wrap">
          <table className="pc-table" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                {th("label", "Source / Seller")}
                {th("soldCount", "Sold")}
                {th("retailCount", "Retail")}
                {th("avgFront", "Front")}
                {th("avgBack", "Back")}
                {th("avgTotal", "Total")}
                {th("avgTurn", "Turn")}
                {th("tradePct", "Trade %")}
                {th("wholesalePct", "WS %")}
                {th("avgWholesaleGross", "Avg WS P/L")}
                {th("avgRecon", "Avg recon")}
                {th("avgVariance", "vs est")}
                <th>vs est %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const open = expanded.has(row.key);
                const sellerSorted = [...row.sellers].sort((a, b) => {
                  const av = sortValue(a, sortKey);
                  const bv = sortValue(b, sortKey);
                  if (typeof av === "string" && typeof bv === "string") {
                    return sortDir === "asc"
                      ? av.localeCompare(bv)
                      : bv.localeCompare(av);
                  }
                  const an = typeof av === "number" ? av : -Infinity;
                  const bn = typeof bv === "number" ? bv : -Infinity;
                  return sortDir === "asc" ? an - bn : bn - an;
                });
                return (
                  <Fragment key={row.key}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className="pc-sort"
                          onClick={() => toggleExpand(row.key)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            fontWeight: 700,
                            color: "var(--da-text)",
                            textTransform: "none",
                            letterSpacing: 0,
                            fontFamily: "inherit",
                            fontSize: 12,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              display: "inline-flex",
                              width: 18,
                              height: 18,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 4,
                              border: "1px solid var(--da-line)",
                              color: "var(--da-muted)",
                              fontSize: 11,
                            }}
                          >
                            {open ? "−" : "+"}
                          </span>
                          {row.label}
                          <span
                            style={{
                              fontWeight: 500,
                              color: "var(--da-muted)",
                              fontSize: 11,
                            }}
                          >
                            ({row.sellers.length})
                          </span>
                        </button>
                      </td>
                      <MetricCells row={row} />
                    </tr>
                    {open
                      ? sellerSorted.map((seller) => (
                          <tr key={seller.key}>
                            <td
                              style={{
                                paddingLeft: 36,
                                fontWeight: 500,
                                color: "var(--da-muted)",
                              }}
                            >
                              {seller.label}
                            </td>
                            <MetricCells row={seller} />
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
