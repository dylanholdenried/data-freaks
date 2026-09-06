/**
 * Human-readable "why" lines and action cues for buy-box / scoreboards.
 *
 * Component scores are absolute (vs platform curves), not peer-relative —
 * strength labels describe how well each metric hits those targets.
 */

import type { RollupRow } from "./aggregate";
import type { ScoredModel } from "./buyBox";

const fmt$ = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
};

function strength(score: number): "strong" | "solid" | "weak" {
  if (score >= 0.7) return "strong";
  if (score >= 0.4) return "solid";
  return "weak";
}

/** One-line explanation of why a row scored high or low on absolute curves. */
export function whyScored(row: ScoredModel): string {
  const parts: { label: string; score: number }[] = [
    { label: "front", score: row.frontScore },
    { label: "back", score: row.backScore },
    { label: "turn", score: row.turnScore },
    { label: "trade %", score: row.tradeScore },
  ];
  parts.sort((a, b) => b.score - a.score);

  const top = parts.slice(0, 2);
  const bottom = [...parts].sort((a, b) => a.score - b.score).slice(0, 1);

  if (row.score >= 0.55) {
    return top
      .map((p) => `${strength(p.score)} ${p.label}`)
      .join(" · ");
  }

  const weak = bottom[0];
  const also = top[0];
  if (weak && also && weak.label !== also.label) {
    return `${strength(weak.score)} ${weak.label} · ${strength(also.score)} ${also.label}`;
  }
  return weak
    ? `${strength(weak.score)} ${weak.label}`
    : "Mixed absolute scores";
}

export function actionCue(
  kind: "buy" | "red" | "near",
  row: ScoredModel | RollupRow
): string {
  if (kind === "near") {
    return `Only ${row.volume} deal${row.volume === 1 ? "" : "s"} — watch; open to dial in.`;
  }
  if (kind === "buy") {
    return "Dial into year / trim / miles / price bands — stock what wins.";
  }
  return "Find the weak bands or sources — fix pricing/turn or pause.";
}

/** Insight vs a baseline total/average row for acquisition / stocking. */
export function vsBaselineInsight(
  row: RollupRow,
  baseline: { avgTotal: number | null; avgAge: number | null; tradePct: number | null }
): string {
  const bits: string[] = [];
  if (row.avgTotal != null && baseline.avgTotal != null) {
    const delta = row.avgTotal - baseline.avgTotal;
    const sign = delta >= 0 ? "+" : "−";
    bits.push(`${sign}${fmt$(Math.abs(delta))} avg total vs cut`);
  }
  if (row.avgAge != null && baseline.avgAge != null) {
    const delta = row.avgAge - baseline.avgAge;
    if (Math.abs(delta) >= 3) {
      bits.push(
        delta < 0
          ? `${Math.abs(Math.round(delta))}d faster turn`
          : `${Math.round(delta)}d slower turn`
      );
    }
  }
  if (row.tradePct != null && baseline.tradePct != null) {
    const delta = row.tradePct - baseline.tradePct;
    if (Math.abs(delta) >= 5) {
      bits.push(
        delta > 0
          ? `+${Math.round(delta)} pts trade %`
          : `${Math.round(delta)} pts trade %`
      );
    }
  }
  if (bits.length === 0) {
    return `${row.volume} deals · near cut average`;
  }
  return `${bits.join(" · ")} · ${row.volume} deals`;
}

export function stockingAction(kind: "buy" | "red", row: RollupRow): string {
  if (kind === "buy") {
    return `Lean into ${row.label} — volume and gross support stocking more.`;
  }
  return `${row.label} underperforms — stock less or change mix/pricing.`;
}
