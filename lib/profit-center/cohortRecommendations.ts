/**
 * Automated dial-in recommendations within a cohort (model, source, band, etc.).
 */

import {
  aggregateByDimension,
  type AggregateContext,
  type Dimension,
  type RollupRow,
} from "./aggregate";
import type { BuyBoxSettings } from "./buyBox";
import { scoreBuyBox } from "./buyBox";
import { INV_TARGETS } from "@/lib/inventory-command/config";
import { pcFmt$, pcFmtN, pcFmtPct } from "./format";

const REC_MIN = 2;
/** Min trade % for a band to count as a winning profile (never avoid). */
const WIN_TRADE_PCT = 40;

const DIAL_DIMS: { id: Dimension; label: string }[] = [
  { id: "year", label: "Year" },
  { id: "trim", label: "Trim" },
  { id: "odometer", label: "Odometer" },
  { id: "price", label: "Sale price" },
  { id: "acquisition", label: "Acquisition" },
];

export type BandPick = {
  label: string;
  key: string;
  volume: number;
  lowSample: boolean;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgAge: number | null;
  tradePct: number | null;
};

export type DimensionRec = {
  dimension: Dimension;
  dimensionLabel: string;
  best: BandPick | null;
  worst: BandPick | null;
  stockLine: string;
  avoidLine: string;
};

export type CohortRecommendations = {
  combinedSummary: string;
  dimensions: DimensionRec[];
  /** Keys for matching on-lot units to winning/losing sale bands. */
  bestPriceBandKey: string | null;
  worstPriceBandKey: string | null;
  bestYearLabel: string | null;
  worstYearLabel: string | null;
};

function metricsSnippet(row: {
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgAge: number | null;
  tradePct: number | null;
}): string {
  const parts = [
    row.avgFront != null ? `front ${pcFmt$(row.avgFront)}` : null,
    row.avgBack != null ? `back ${pcFmt$(row.avgBack)}` : null,
    row.avgTotal != null ? `total ${pcFmt$(row.avgTotal)}` : null,
    row.avgAge != null ? `${pcFmtN(row.avgAge, 0)}d turn` : null,
    row.tradePct != null ? `${pcFmtPct(row.tradePct)} trade` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "mixed metrics";
}

function toPick(row: RollupRow, adminMin: number): BandPick {
  return {
    label: row.label,
    key: row.key,
    volume: row.volume,
    lowSample: row.volume < adminMin,
    avgFront: row.avgFront,
    avgBack: row.avgBack,
    avgTotal: row.avgTotal,
    avgAge: row.avgAge,
    tradePct: row.tradePct,
  };
}

function lineFor(
  kind: "stock" | "avoid",
  dimLabel: string,
  pick: BandPick | null
): string {
  if (!pick) {
    return kind === "stock"
      ? `${dimLabel}: not enough data to recommend.`
      : `${dimLabel}: no red-light bands in this cut — nothing to avoid.`;
  }
  const sample = pick.lowSample ? " (low sample)" : "";
  const verb = kind === "stock" ? "Stock more" : "Avoid";
  return `${verb} ${pick.label}${sample} — ${pick.volume} deal${pick.volume === 1 ? "" : "s"}, ${metricsSnippet(pick)}.`;
}

/**
 * Winning vehicle profile — if a band meets this, never recommend avoid
 * even when buy-box scores it as a red-light vs other bands in the dimension.
 */
export function isWinningVehicleProfile(row: RollupRow): boolean {
  if (row.avgFront == null || row.avgFront <= 0) return false;
  if (row.avgBack == null || row.avgBack <= 0) return false;
  if (row.avgAge == null || row.avgAge >= INV_TARGETS.turnDays) return false;
  if (row.tradePct == null || row.tradePct < WIN_TRADE_PCT) return false;
  return true;
}

function compareByTotal(a: RollupRow, b: RollupRow): number {
  const at = a.avgTotal ?? -Infinity;
  const bt = b.avgTotal ?? -Infinity;
  if (bt !== at) return bt - at;
  if (b.volume !== a.volume) return b.volume - a.volume;
  const aa = a.avgAge ?? Infinity;
  const ba = b.avgAge ?? Infinity;
  return aa - ba;
}

/**
 * Stock = highest avg total gross in the band.
 * Avoid = buy-box red-light bands that fail the winning vehicle profile
 * (positive front & back, turn under 45d, trade % at least 40%).
 */
function pickForDimension(
  dim: Dimension,
  ctx: AggregateContext,
  settings: BuyBoxSettings,
  skip: Dimension[]
): DimensionRec | null {
  if (skip.includes(dim)) return null;

  const rows = aggregateByDimension(dim, ctx).rows.filter(
    (r) => !r.isTotal && r.volume >= REC_MIN
  );
  if (rows.length === 0) return null;

  const dimLabel = DIAL_DIMS.find((d) => d.id === dim)?.label ?? dim;

  const byTotalDesc = [...rows].sort(compareByTotal);
  const bestRow = byTotalDesc[0] ?? null;

  let worstRow: RollupRow | null = null;
  if (rows.length >= 2) {
    const scored = scoreBuyBox(rows, {
      ...settings,
      minVolume: REC_MIN,
      listSize: Math.max(1, Math.floor(rows.length / 2)),
    });

    // Prefer buy-box red-lights that fail the winning profile (lowest score first)
    const avoidCandidates = [...scored.scored]
      .filter((r) => !isWinningVehicleProfile(r))
      .sort((a, b) => a.score - b.score || (a.avgTotal ?? 0) - (b.avgTotal ?? 0));

    worstRow = avoidCandidates[0] ?? null;
  }

  const best = bestRow ? toPick(bestRow, settings.minVolume) : null;
  const worst = worstRow ? toPick(worstRow, settings.minVolume) : null;

  return {
    dimension: dim,
    dimensionLabel: dimLabel,
    best,
    worst,
    stockLine: lineFor("stock", dimLabel, best),
    avoidLine: lineFor("avoid", dimLabel, worst),
  };
}

export function buildCohortRecommendations(
  ctx: AggregateContext,
  settings: BuyBoxSettings,
  skipDimensions: Dimension[] = []
): CohortRecommendations {
  const dimensions: DimensionRec[] = [];
  for (const d of DIAL_DIMS) {
    const rec = pickForDimension(d.id, ctx, settings, skipDimensions);
    if (rec) dimensions.push(rec);
  }

  const parts: string[] = [];
  const avoidParts: string[] = [];

  for (const d of dimensions) {
    if (d.best) parts.push(d.best.label);
    if (d.worst) avoidParts.push(d.worst.label);
  }

  let combinedSummary =
    parts.length === 0
      ? "Not enough closed deals in this cut to auto-recommend a spec — review individual deals below."
      : `Best spec to stock: ${parts.join(" · ")}.`;

  if (avoidParts.length > 0) {
    combinedSummary += ` Avoid: ${avoidParts.join(" · ")}.`;
  }

  const priceRec = dimensions.find((d) => d.dimension === "price");
  const yearRec = dimensions.find((d) => d.dimension === "year");

  return {
    combinedSummary,
    dimensions,
    bestPriceBandKey: priceRec?.best?.key ?? null,
    worstPriceBandKey: priceRec?.worst?.key ?? null,
    bestYearLabel: yearRec?.best?.label ?? null,
    worstYearLabel: yearRec?.worst?.label ?? null,
  };
}
