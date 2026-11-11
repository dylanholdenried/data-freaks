"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BuyBoxResult, BuyBoxSettings, ScoredModel } from "@/lib/profit-center/buyBox";
import { compareHref } from "@/lib/profit-center/cohort";
import type { DatePreset } from "@/lib/profit-center/dateRange";
import BuyBoxRow from "../BuyBoxRow";
import { fmt$, fmtN, fmtPct } from "../format";

const MIN_DEAL_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 20];

type CohortCtx = {
  preset: DatePreset;
  storeId: string;
  departmentName: string;
};

type ScoredSortKey =
  | "rank"
  | "label"
  | "score"
  | "volume"
  | "avgFront"
  | "avgBack"
  | "avgTotal"
  | "avgAge"
  | "tradePct";

type Props = {
  buyBox: BuyBoxResult;
  groupDefaultMin: number;
  minVolume: number;
  onMinVolumeChange: (n: number) => void;
  settings: BuyBoxSettings;
  modelHrefFromLabel: (label: string) => string;
  cohortCtx: CohortCtx;
};

export default function BuyBoxTab({
  buyBox,
  groupDefaultMin,
  minVolume,
  onMinVolumeChange,
  settings,
  modelHrefFromLabel,
  cohortCtx,
}: Props) {
  const [showNearMiss, setShowNearMiss] = useState(false);
  const [sortKey, setSortKey] = useState<ScoredSortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const options = MIN_DEAL_OPTIONS.includes(minVolume)
    ? MIN_DEAL_OPTIONS
    : [...MIN_DEAL_OPTIONS, minVolume].sort((a, b) => a - b);

  const sortedScored = useMemo(() => {
    const indexed = buyBox.scored.map((row, i) => ({ row, rank: i + 1 }));
    indexed.sort((a, b) => {
      if (sortKey === "rank") {
        return sortDir === "asc" ? a.rank - b.rank : b.rank - a.rank;
      }
      if (sortKey === "label") {
        return sortDir === "asc"
          ? a.row.label.localeCompare(b.row.label)
          : b.row.label.localeCompare(a.row.label);
      }
      const av = a.row[sortKey];
      const bv = b.row[sortKey];
      const an = typeof av === "number" && Number.isFinite(av) ? av : -Infinity;
      const bn = typeof bv === "number" && Number.isFinite(bv) ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return indexed;
  }, [buyBox.scored, sortKey, sortDir]);

  function toggleSort(k: ScoredSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "label" || k === "rank" ? "asc" : "desc");
    }
  }

  function mark(k: ScoredSortKey) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  return (
    <div className="space-y-4">
      <section className="pc-panel">
        <p className="pc-panel-label">Minimum deals to score</p>
        <div className="pc-pill-row" style={{ alignItems: "center", gap: 12 }}>
          <select
            value={minVolume}
            onChange={(e) => onMinVolumeChange(Number(e.target.value))}
            aria-label="Minimum deals"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n} deal{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <span className="pc-muted" style={{ fontSize: 12 }}>
            Session override · group default: {groupDefaultMin}
          </span>
        </div>
      </section>

      <section className="pc-buybox">
        <div className="pc-buybox-head">
          <h2>Buy-box &amp; red-lights</h2>
          <p>
            Models scored on front profit, back profit, turn (avg age), and trade
            % — weighted{" "}
            {(settings.weightFront * 100).toFixed(0)}/
            {(settings.weightBack * 100).toFixed(0)}/
            {(settings.weightTurn * 100).toFixed(0)}/
            {(settings.weightTrade * 100).toFixed(0)}. Needs at least {minVolume}{" "}
            closed deals to rate. Top/bottom lists use the group list size (
            {settings.listSize}).
          </p>
        </div>
        <div className="pc-buybox-cols">
          <div>
            <div className="pc-buybox-title buy">Buy more</div>
            {buyBox.buys.length === 0 ? (
              <p className="pc-muted">
                No models meet the minimum volume in this cut.
              </p>
            ) : (
              buyBox.buys.map((row) => (
                <BuyBoxRow
                  key={row.key}
                  row={row}
                  kind="buy"
                  href={modelHrefFromLabel(row.label)}
                  compareHref={compareHref({
                    type: "model",
                    a: row.label,
                    ...cohortCtx,
                  })}
                />
              ))
            )}
          </div>
          <div>
            <div className="pc-buybox-title red">Red-light</div>
            {buyBox.reds.length === 0 ? (
              <p className="pc-muted">No red-lights in this cut.</p>
            ) : (
              buyBox.reds.map((row) => (
                <BuyBoxRow
                  key={row.key}
                  row={row}
                  kind="red"
                  href={modelHrefFromLabel(row.label)}
                  compareHref={compareHref({
                    type: "model",
                    a: row.label,
                    ...cohortCtx,
                  })}
                />
              ))
            )}
          </div>
        </div>
        {buyBox.nearMiss.length > 0 && (
          <div className="pc-near-miss pc-near-miss-collapsed">
            <button
              type="button"
              className="pc-near-miss-toggle"
              onClick={() => setShowNearMiss((v) => !v)}
            >
              {showNearMiss ? "Hide" : "Show"} {buyBox.nearMiss.length} near-miss
              model{buyBox.nearMiss.length === 1 ? "" : "s"} (under {minVolume}{" "}
              deals)
            </button>
            {showNearMiss &&
              buyBox.nearMiss.map((row) => (
                <BuyBoxRow
                  key={row.key}
                  row={row}
                  kind="near"
                  href={modelHrefFromLabel(row.label)}
                  compareHref={compareHref({
                    type: "model",
                    a: row.label,
                    ...cohortCtx,
                  })}
                />
              ))}
          </div>
        )}
      </section>

      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>All scored models</h2>
          <p>
            Every model with at least {minVolume} deals, ranked highest score to
            lowest.
          </p>
        </div>
        {buyBox.scored.length === 0 ? (
          <p className="pc-muted">
            No models meet the minimum volume in this cut.
          </p>
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("rank")}
                    >
                      #{mark("rank")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("label")}
                    >
                      Model{mark("label")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("score")}
                    >
                      Score{mark("score")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("volume")}
                    >
                      Vol{mark("volume")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgFront")}
                    >
                      Avg Front{mark("avgFront")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgBack")}
                    >
                      Avg Back{mark("avgBack")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgTotal")}
                    >
                      Avg Total{mark("avgTotal")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgAge")}
                    >
                      Turn{mark("avgAge")}
                    </button>
                  </th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("tradePct")}
                    >
                      Trade %{mark("tradePct")}
                    </button>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedScored.map(({ row, rank }: { row: ScoredModel; rank: number }) => (
                  <tr key={row.key}>
                    <td>{rank}</td>
                    <td>{row.label}</td>
                    <td className="text-right">{(row.score * 100).toFixed(0)}</td>
                    <td className="text-right">{row.volume}</td>
                    <td className="text-right">{fmt$(row.avgFront)}</td>
                    <td className="text-right">{fmt$(row.avgBack)}</td>
                    <td className="text-right">{fmt$(row.avgTotal)}</td>
                    <td className="text-right">
                      {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                    </td>
                    <td className="text-right">{fmtPct(row.tradePct)}</td>
                    <td className="text-right">
                      <div className="pc-buybox-actions" style={{ justifyContent: "flex-end" }}>
                        <Link
                          href={modelHrefFromLabel(row.label)}
                          className="pc-link"
                        >
                          View
                        </Link>
                        <Link
                          href={compareHref({
                            type: "model",
                            a: row.label,
                            ...cohortCtx,
                          })}
                          className="pc-link"
                        >
                          Compare
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
