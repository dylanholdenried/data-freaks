/**
 * Buy-box / red-light scoring for Profit Center model rollups.
 * Weights and min volume are admin-adjustable per dealer group.
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

function normalizeHigher(values: number[], v: number): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return 0.5;
  return (v - min) / (max - min);
}

function normalizeLower(values: number[], v: number): number {
  return 1 - normalizeHigher(values, v);
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

  const fronts = eligible.map((r) => r.avgFront ?? 0);
  const backs = eligible.map((r) => r.avgBack ?? 0);
  const ages = eligible.map((r) => r.avgAge ?? 60);
  const trades = eligible.map((r) => r.tradePct ?? 0);

  const scored: ScoredModel[] = eligible.map((row, i) => {
    const frontScore = normalizeHigher(fronts, fronts[i]!);
    const backScore = normalizeHigher(backs, backs[i]!);
    const turnScore = normalizeLower(ages, ages[i]!);
    const tradeScore = normalizeHigher(trades, trades[i]!);
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
