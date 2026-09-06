/**
 * Buy-box / red-light scoring for Profit Center model rollups.
 *
 * Component scores are absolute (platform defaults): linear clamps for
 * front / back / trade %, age buckets for turn. Weights and min volume
 * are admin-adjustable per dealer group.
 */

import type { RollupRow } from "./aggregate";

export type BuyBoxSettings = {
  minVolume: number;
  weightFront: number;
  weightBack: number;
  weightTurn: number;
  weightTrade: number;
  listSize: number;
};

export const DEFAULT_BUY_BOX_SETTINGS: BuyBoxSettings = {
  minVolume: 3,
  weightFront: 0.35,
  weightBack: 0.25,
  weightTurn: 0.25,
  weightTrade: 0.15,
  listSize: 5,
};

/** Absolute score anchors — higher metric → higher score. */
export type ScoreAnchor = {
  floor: number;
  ceiling: number;
};

/** Turn bands: age ≤ maxDays maps to score (first match wins). */
export type TurnBand = {
  maxDays: number;
  score: number;
};

/** Platform defaults for absolute component scoring. */
export const DEFAULT_SCORE_CURVES = {
  front: { floor: -1500, ceiling: 2500 } satisfies ScoreAnchor,
  back: { floor: 0, ceiling: 2500 } satisfies ScoreAnchor,
  /** tradePct is stored as 0–100. */
  trade: { floor: 20, ceiling: 60 } satisfies ScoreAnchor,
  turnBands: [
    { maxDays: 30, score: 1 },
    { maxDays: 45, score: 0.75 },
    { maxDays: 60, score: 0.5 },
    { maxDays: 90, score: 0.25 },
    { maxDays: Infinity, score: 0 },
  ] satisfies TurnBand[],
} as const;

export type ScoredModel = RollupRow & {
  score: number;
  frontScore: number;
  backScore: number;
  turnScore: number;
  tradeScore: number;
};

export type BuyBoxResult = {
  buys: ScoredModel[];
  reds: ScoredModel[];
  scored: ScoredModel[];
  /** Rows just under min volume — still useful to inspect. */
  nearMiss: RollupRow[];
};

/**
 * Linear clamp: below floor → 0, above ceiling → 1, even gradient between.
 */
export function clampLinear(
  value: number,
  floor: number,
  ceiling: number
): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || ceiling === floor) {
    return 0.5;
  }
  if (value <= floor) return 0;
  if (value >= ceiling) return 1;
  return (value - floor) / (ceiling - floor);
}

/** Score days-on-lot against ordered turn bands (≤ maxDays). */
export function scoreTurnBuckets(
  ageDays: number,
  bands: readonly TurnBand[] = DEFAULT_SCORE_CURVES.turnBands
): number {
  const age = Number.isFinite(ageDays) ? ageDays : 60;
  for (const band of bands) {
    if (age <= band.maxDays) return band.score;
  }
  return 0;
}

export function scoreFrontProfit(
  avgFront: number,
  anchor: ScoreAnchor = DEFAULT_SCORE_CURVES.front
): number {
  return clampLinear(avgFront, anchor.floor, anchor.ceiling);
}

export function scoreBackProfit(
  avgBack: number,
  anchor: ScoreAnchor = DEFAULT_SCORE_CURVES.back
): number {
  return clampLinear(avgBack, anchor.floor, anchor.ceiling);
}

/** tradePct is 0–100 (e.g. 45 means 45%). */
export function scoreTradePct(
  tradePct: number,
  anchor: ScoreAnchor = DEFAULT_SCORE_CURVES.trade
): number {
  return clampLinear(tradePct, anchor.floor, anchor.ceiling);
}

/** Normalize weights so they sum to 1 (falls back to defaults if all zero). */
export function normalizeWeights(s: BuyBoxSettings): BuyBoxSettings {
  const sum =
    s.weightFront + s.weightBack + s.weightTurn + s.weightTrade;
  if (!Number.isFinite(sum) || sum <= 0) return { ...DEFAULT_BUY_BOX_SETTINGS };
  return {
    ...s,
    weightFront: s.weightFront / sum,
    weightBack: s.weightBack / sum,
    weightTurn: s.weightTurn / sum,
    weightTrade: s.weightTrade / sum,
  };
}

function nearMissRows(
  rows: RollupRow[],
  minVol: number,
  listSize: number
): RollupRow[] {
  const floor = Math.max(1, minVol - 2);
  if (floor >= minVol) return [];
  return rows
    .filter((r) => !r.isTotal && r.volume >= floor && r.volume < minVol)
    .sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label))
    .slice(0, listSize);
}

/**
 * Score any dimension rollup (model, acquisition, price band, etc.)
 * with the same weighted buy / red-light engine.
 */
export function scoreBuyBox(
  modelRows: RollupRow[],
  settings: BuyBoxSettings = DEFAULT_BUY_BOX_SETTINGS
): BuyBoxResult {
  const cfg = normalizeWeights(settings);
  const minVol = Math.max(1, Math.floor(cfg.minVolume) || 3);
  const listSize = Math.max(1, Math.floor(cfg.listSize) || 5);
  const nearMiss = nearMissRows(modelRows, minVol, listSize);

  const eligible = modelRows.filter(
    (r) => !r.isTotal && r.volume >= minVol
  );

  if (eligible.length === 0) {
    return { buys: [], reds: [], scored: [], nearMiss };
  }

  const scored: ScoredModel[] = eligible.map((row) => {
    const frontScore = scoreFrontProfit(row.avgFront ?? 0);
    const backScore = scoreBackProfit(row.avgBack ?? 0);
    const turnScore = scoreTurnBuckets(row.avgAge ?? 60);
    const tradeScore = scoreTradePct(row.tradePct ?? 0);
    const score =
      cfg.weightFront * frontScore +
      cfg.weightBack * backScore +
      cfg.weightTurn * turnScore +
      cfg.weightTrade * tradeScore;
    return {
      ...row,
      score,
      frontScore,
      backScore,
      turnScore,
      tradeScore,
    };
  });

  scored.sort((a, b) => b.score - a.score || b.volume - a.volume);

  const buys = scored.slice(0, Math.min(listSize, scored.length));
  // Avoid overlapping lists when few eligible models
  const redStart = Math.max(0, scored.length - listSize);
  let reds = scored.slice(redStart).reverse();
  if (scored.length <= listSize) {
    // With a tiny set, top and bottom may overlap — prefer distinct when possible
    const buyKeys = new Set(buys.map((b) => b.key));
    reds = scored.filter((r) => !buyKeys.has(r.key)).reverse().slice(0, listSize);
    // If everything was in buys (n <= listSize and we took all), take bottom half as reds
    if (reds.length === 0 && scored.length >= 2) {
      reds = scored.slice(Math.ceil(scored.length / 2)).reverse();
    }
  } else {
    const buyKeys = new Set(buys.map((b) => b.key));
    reds = reds.filter((r) => !buyKeys.has(r.key));
  }

  return { buys, reds, scored, nearMiss };
}

/** Alias — same engine for acquisition / price / odometer / year scoreboards. */
export const scoreDimension = scoreBuyBox;

export function settingsFromDbRow(
  row: {
    min_volume?: number | null;
    weight_front?: number | null;
    weight_back?: number | null;
    weight_turn?: number | null;
    weight_trade?: number | null;
    list_size?: number | null;
  } | null
): BuyBoxSettings {
  if (!row) return { ...DEFAULT_BUY_BOX_SETTINGS };
  return {
    minVolume: row.min_volume ?? DEFAULT_BUY_BOX_SETTINGS.minVolume,
    weightFront: Number(row.weight_front ?? DEFAULT_BUY_BOX_SETTINGS.weightFront),
    weightBack: Number(row.weight_back ?? DEFAULT_BUY_BOX_SETTINGS.weightBack),
    weightTurn: Number(row.weight_turn ?? DEFAULT_BUY_BOX_SETTINGS.weightTurn),
    weightTrade: Number(row.weight_trade ?? DEFAULT_BUY_BOX_SETTINGS.weightTrade),
    listSize: row.list_size ?? DEFAULT_BUY_BOX_SETTINGS.listSize,
  };
}
