"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RollupRow } from "@/lib/profit-center/aggregate";
import { cohortHref } from "@/lib/profit-center/cohort";
import type { DatePreset } from "@/lib/profit-center/dateRange";
import { cn } from "@/lib/utils";
import {
  fmt$,
  fmtDelta$,
  fmtDeltaDays,
  fmtN,
  fmtPct,
} from "../format";

type CohortCtx = {
  preset: DatePreset;
  storeId: string;
  departmentName: string;
};

type SortKey =
  | "label"
  | "volume"
  | "mix"
  | "avgFront"
  | "avgBack"
  | "avgTotal"
  | "avgAge"
  | "avgSalePrice"
  | "tradePct"
  | "front"
  | "back"
  | "total";

function delta(
  value: number | null,
  overall: number | null
): number | null {
  if (value == null || overall == null) return null;
  return value - overall;
}

function insightLine(rows: RollupRow[]): string | null {
  const withVol = rows.filter((r) => r.volume > 0);
  if (withVol.length < 2) return null;

  const byBack = [...withVol].sort(
    (a, b) => (b.avgBack ?? -Infinity) - (a.avgBack ?? -Infinity)
  );
  const byFront = [...withVol].sort(
    (a, b) => (b.avgFront ?? -Infinity) - (a.avgFront ?? -Infinity)
  );
  const byTurn = [...withVol]
    .filter((r) => r.avgAge != null)
    .sort((a, b) => (a.avgAge ?? Infinity) - (b.avgAge ?? Infinity));

  const parts: string[] = [];
  const topBack = byBack[0];
  const bottomBack = byBack[byBack.length - 1];
  if (
    topBack &&
    bottomBack &&
    topBack.key !== bottomBack.key &&
    topBack.avgBack != null &&
    bottomBack.avgBack != null
  ) {
    const gap = topBack.avgBack - bottomBack.avgBack;
    if (gap >= 250) {
      parts.push(
        `${bottomBack.label} avg back is ${fmt$(gap)} below ${topBack.label}`
      );
    }
  }

  const topFront = byFront[0];
  if (
    topFront &&
    topBack &&
    topFront.key !== topBack.key &&
    topFront.avgFront != null &&
    topBack.avgBack != null
  ) {
    parts.push(
      `${topFront.label} leads front (${fmt$(topFront.avgFront)}); ${topBack.label} leads back (${fmt$(topBack.avgBack)})`
    );
  }

  const fastest = byTurn[0];
  if (fastest && fastest.avgAge != null) {
    parts.push(`${fastest.label} turns fastest at ${fmtN(fastest.avgAge, 0)}d`);
  }

  return parts.slice(0, 2).join(" · ") || null;
}

export default function DepartmentPerformanceTab({
  rows,
  overall,
  outsideCount,
  typedVolume,
  cohortCtx,
}: {
  rows: RollupRow[];
  overall: RollupRow;
  outsideCount: number;
  typedVolume: number;
  cohortCtx: CohortCtx;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const insight = useMemo(() => insightLine(rows), [rows]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "mix") {
        const am = typedVolume === 0 ? 0 : a.volume / typedVolume;
        const bm = typedVolume === 0 ? 0 : b.volume / typedVolume;
        return sortDir === "asc" ? am - bm : bm - am;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "label") {
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      const an = typeof av === "number" && Number.isFinite(av) ? av : -Infinity;
      const bn = typeof bv === "number" && Number.isFinite(bv) ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir, typedVolume]);

  function toggle(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "label" ? "asc" : "desc");
    }
  }

  function mark(k: SortKey) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  return (
    <div className="space-y-4">
      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>Department performance</h2>
          <p>
            Sold-deal KPIs by finance type (Prime, Subprime, Cash). Same cut as
            the rest of Profit Center — store, date, and org department filters
            apply.
          </p>
        </div>

        {typedVolume === 0 ? (
          <p className="pc-muted">
            No Prime / Subprime / Cash deals in this cut.
          </p>
        ) : (
          <div className="pc-finance-scoreboard">
            {rows.map((row) => {
              const mix =
                typedVolume === 0 ? null : (row.volume / typedVolume) * 100;
              return (
                <div key={row.key} className="pc-finance-card">
                  <div className="pc-finance-card-head">
                    <h3>{row.label}</h3>
                    <span className="pc-finance-mix">{fmtPct(mix)} mix</span>
                  </div>
                  <div className="pc-finance-card-units">
                    {fmtN(row.volume)} units
                    {row.volume > 0 ? (
                      <>
                        {" · "}
                        <Link
                          href={cohortHref({
                            focus: "finance",
                            value: row.key,
                            ...cohortCtx,
                          })}
                          className="pc-link"
                        >
                          View deals
                        </Link>
                      </>
                    ) : null}
                  </div>
                  <div className="pc-kpi-grid pc-kpi-grid-compact">
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Avg front</div>
                      <div className="pc-kpi-value">{fmt$(row.avgFront)}</div>
                      <div className="pc-kpi-sub">
                        vs overall{" "}
                        {fmtDelta$(delta(row.avgFront, overall.avgFront))}
                      </div>
                    </div>
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Avg back</div>
                      <div className="pc-kpi-value">{fmt$(row.avgBack)}</div>
                      <div className="pc-kpi-sub">
                        vs overall{" "}
                        {fmtDelta$(delta(row.avgBack, overall.avgBack))}
                      </div>
                    </div>
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Avg total</div>
                      <div className="pc-kpi-value">{fmt$(row.avgTotal)}</div>
                      <div className="pc-kpi-sub">
                        vs overall{" "}
                        {fmtDelta$(delta(row.avgTotal, overall.avgTotal))}
                      </div>
                    </div>
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Avg turn</div>
                      <div
                        className={cn(
                          "pc-kpi-value",
                          row.avgAge != null && row.avgAge > 45 && "red"
                        )}
                      >
                        {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                      </div>
                      <div className="pc-kpi-sub">
                        vs overall{" "}
                        {fmtDeltaDays(delta(row.avgAge, overall.avgAge))}
                      </div>
                    </div>
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Avg sale $</div>
                      <div className="pc-kpi-value">
                        {fmt$(row.avgSalePrice)}
                      </div>
                      <div className="pc-kpi-sub">
                        vs overall{" "}
                        {fmtDelta$(
                          delta(row.avgSalePrice, overall.avgSalePrice)
                        )}
                      </div>
                    </div>
                    <div className="pc-kpi">
                      <div className="pc-kpi-label">Trade %</div>
                      <div className="pc-kpi-value">{fmtPct(row.tradePct)}</div>
                      <div className="pc-kpi-sub">
                        {fmtN(row.trades)} trades
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {insight ? <p className="pc-finance-insight">{insight}</p> : null}

        {outsideCount > 0 ? (
          <p className="pc-muted" style={{ marginTop: 8 }}>
            {outsideCount.toLocaleString()} deal
            {outsideCount === 1 ? "" : "s"} outside Prime / Subprime / Cash
            (lease, bulk upload, or blank).
          </p>
        ) : null}
      </section>

      <section className="pc-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("label")}
                  >
                    Type{mark("label")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("volume")}
                  >
                    Vol{mark("volume")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("mix")}
                  >
                    Mix %{mark("mix")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgFront")}
                  >
                    Avg Front{mark("avgFront")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgBack")}
                  >
                    Avg Back{mark("avgBack")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgTotal")}
                  >
                    Avg Total{mark("avgTotal")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgAge")}
                  >
                    Turn{mark("avgAge")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgSalePrice")}
                  >
                    Avg Sale ${mark("avgSalePrice")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("tradePct")}
                  >
                    Trade %{mark("tradePct")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("front")}
                  >
                    Front $
                    {mark("front")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("back")}
                  >
                    Back ${mark("back")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("total")}
                  >
                    Total ${mark("total")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const mix =
                  typedVolume === 0 ? null : (row.volume / typedVolume) * 100;
                return (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td className="text-right">{row.volume}</td>
                    <td className="text-right">{fmtPct(mix)}</td>
                    <td className="text-right">{fmt$(row.avgFront)}</td>
                    <td className="text-right">{fmt$(row.avgBack)}</td>
                    <td className="text-right">{fmt$(row.avgTotal)}</td>
                    <td className="text-right">
                      {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                    </td>
                    <td className="text-right">{fmt$(row.avgSalePrice)}</td>
                    <td className="text-right">{fmtPct(row.tradePct)}</td>
                    <td className="text-right">{fmt$(row.front)}</td>
                    <td className="text-right">{fmt$(row.back)}</td>
                    <td className="text-right">{fmt$(row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{overall.label}</td>
                <td className="text-right">{overall.volume}</td>
                <td className="text-right">—</td>
                <td className="text-right">{fmt$(overall.avgFront)}</td>
                <td className="text-right">{fmt$(overall.avgBack)}</td>
                <td className="text-right">{fmt$(overall.avgTotal)}</td>
                <td className="text-right">
                  {overall.avgAge == null
                    ? "—"
                    : `${fmtN(overall.avgAge, 0)}d`}
                </td>
                <td className="text-right">{fmt$(overall.avgSalePrice)}</td>
                <td className="text-right">{fmtPct(overall.tradePct)}</td>
                <td className="text-right">{fmt$(overall.front)}</td>
                <td className="text-right">{fmt$(overall.back)}</td>
                <td className="text-right">{fmt$(overall.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
