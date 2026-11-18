"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  BuyBoxResult,
  BuyBoxSettings,
  ScoredModel,
} from "@/lib/profit-center/buyBox";
import type { RollupRow } from "@/lib/profit-center/aggregate";
import { fmt$, fmtN, fmtPct } from "@/app/app/profit-center/format";

const MIN_DEAL_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 20];

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

function ModelList({
  title,
  tone,
  rows,
  modelHrefFromRow,
}: {
  title: string;
  tone: "buy" | "red";
  rows: ScoredModel[];
  modelHrefFromRow: (row: { key: string; label: string }) => string;
}) {
  return (
    <div>
      <div className={cn("pc-buybox-title", tone === "buy" ? "buy" : "red")}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="pc-muted">None at current min volume.</p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="pc-buybox-row">
            <div className="pc-buybox-row-main">
              <b>{row.label}</b>
              <span>
                {row.volume} retail · front {fmt$(row.avgFront)} · back{" "}
                {fmt$(row.avgBack)} · {fmtN(row.avgAge, 0)}d · trade{" "}
                {fmtPct(row.tradePct)}
              </span>
              <div className="pc-buybox-actions">
                <Link href={modelHrefFromRow(row)} className="pc-link">
                  View deals
                </Link>
              </div>
            </div>
            <div className={cn("pc-buybox-score", tone)}>
              {(row.score * 100).toFixed(0)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function BuyBoxTab({
  buyBox,
  groupDefaultMin,
  minVolume,
  onMinVolumeChange,
  settings,
  modelHrefFromRow,
}: {
  buyBox: BuyBoxResult;
  groupDefaultMin: number;
  minVolume: number;
  onMinVolumeChange: (n: number) => void;
  settings: BuyBoxSettings;
  modelHrefFromRow: (row: { key: string; label: string }) => string;
}) {
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
        <p className="pc-panel-label">Minimum retail deals to score</p>
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
            Session override · group default: {groupDefaultMin}. Weights{" "}
            {(settings.weightFront * 100).toFixed(0)}/
            {(settings.weightBack * 100).toFixed(0)}/
            {(settings.weightTurn * 100).toFixed(0)}/
            {(settings.weightTrade * 100).toFixed(0)}. Wholesale excluded from
            score.
          </span>
        </div>
      </section>

      <section className="pc-buybox">
        <div className="pc-buybox-head">
          <h2>Buy-box &amp; red-lights</h2>
          <p>
            Models scored on front, back, turn (purchase → sold), and trade % —
            same Profit Center engine. Retail-like exits only. View deals opens
            the Acquire cohort for that model.
          </p>
        </div>
        <div className="pc-buybox-cols">
          <ModelList
            title="Buy more"
            tone="buy"
            rows={buyBox.buys}
            modelHrefFromRow={modelHrefFromRow}
          />
          <ModelList
            title="Red-light"
            tone="red"
            rows={buyBox.reds}
            modelHrefFromRow={modelHrefFromRow}
          />
        </div>
        {buyBox.nearMiss.length > 0 ? (
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
            {showNearMiss
              ? buyBox.nearMiss.map((row: RollupRow) => (
                  <div key={row.key} className="pc-buybox-row">
                    <div className="pc-buybox-row-main">
                      <b>{row.label}</b>
                      <span>
                        {row.volume} retail · avg {fmt$(row.avgTotal)}
                      </span>
                      <div className="pc-buybox-actions">
                        <Link
                          href={modelHrefFromRow(row)}
                          className="pc-link"
                        >
                          View deals
                        </Link>
                      </div>
                    </div>
                    <div className="pc-buybox-score near">{row.volume}</div>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </section>

      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>All scored models</h2>
          <p>
            Every model with at least {minVolume} retail deals, ranked by score.
          </p>
        </div>
        {sortedScored.length === 0 ? (
          <p className="pc-muted">No models meet the minimum volume yet.</p>
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
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("score")}
                    >
                      Score{mark("score")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("volume")}
                    >
                      Vol{mark("volume")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgFront")}
                    >
                      Front{mark("avgFront")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgBack")}
                    >
                      Back{mark("avgBack")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgTotal")}
                    >
                      Total{mark("avgTotal")}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="pc-sort"
                      onClick={() => toggleSort("avgAge")}
                    >
                      Turn{mark("avgAge")}
                    </button>
                  </th>
                  <th>
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
                {sortedScored.map(({ row, rank }) => (
                  <tr key={row.key}>
                    <td>{rank}</td>
                    <td>{row.label}</td>
                    <td>{(row.score * 100).toFixed(0)}</td>
                    <td>{row.volume}</td>
                    <td>{fmt$(row.avgFront)}</td>
                    <td>{fmt$(row.avgBack)}</td>
                    <td>{fmt$(row.avgTotal)}</td>
                    <td>
                      {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                    </td>
                    <td>{fmtPct(row.tradePct)}</td>
                    <td>
                      <div
                        className="pc-buybox-actions"
                        style={{ justifyContent: "flex-end" }}
                      >
                        <Link
                          href={modelHrefFromRow(row)}
                          className="pc-link"
                        >
                          View deals
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
