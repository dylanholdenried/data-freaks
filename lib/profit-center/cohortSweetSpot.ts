/**
 * Year sweet-spot picks for a model cohort (buy-box ranked).
 */

import {
  aggregateByDimension,
  buildTradesByDeal,
  type ProfitDeal,
  type ProfitTrade,
} from "./aggregate";
import { scoreBuyBox, type BuyBoxSettings } from "./buyBox";

export type SweetSpotCombo = {
  key: string;
  year: number;
  label: string;
  volume: number;
  avgTotal: number | null;
  avgAge: number | null;
  score: number | null;
  meetsMinVolume: boolean;
  kind: "stock" | "avoid";
};

/**
 * Rank model years by buy-box score.
 * Returns top stock (~5) and bottom avoid (~3) among eligible volume.
 */
export function buildSweetSpotCombos(opts: {
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  buyBoxSettings: BuyBoxSettings;
  softMinVolume?: number;
  topN?: number;
  avoidN?: number;
}): { stock: SweetSpotCombo[]; avoid: SweetSpotCombo[] } {
  const {
    deals,
    trades,
    buyBoxSettings,
    softMinVolume = 2,
    topN = 5,
    avoidN = 3,
  } = opts;

  if (deals.length === 0) {
    return { stock: [], avoid: [] };
  }

  const tradesByDeal = buildTradesByDeal(trades);
  const { rows } = aggregateByDimension("year", {
    deals,
    tradesByDeal,
    dealSalespeople: [],
    salespersonNames: new Map(),
    departmentNames: new Map(),
  });

  const hardMin = Math.max(1, Math.floor(buyBoxSettings.minVolume) || 3);
  const qualifyingHard = rows.filter((r) => r.volume >= hardMin).length;
  const effectiveMin = qualifyingHard >= 2 ? hardMin : softMinVolume;

  const eligible = rows.filter((r) => r.volume >= effectiveMin);
  if (eligible.length === 0) {
    return { stock: [], avoid: [] };
  }

  const scored = scoreBuyBox(eligible, {
    ...buyBoxSettings,
    minVolume: effectiveMin,
  });

  const toCombo = (
    row: (typeof scored.scored)[number],
    kind: "stock" | "avoid"
  ): SweetSpotCombo => {
    const year = Number(row.key);
    return {
      key: row.key,
      year: Number.isFinite(year) ? year : 0,
      label: row.label,
      volume: row.volume,
      avgTotal: row.avgTotal,
      avgAge: row.avgAge,
      score: row.score,
      meetsMinVolume: row.volume >= hardMin,
      kind,
    };
  };

  const stock = scored.scored.slice(0, topN).map((r) => toCombo(r, "stock"));
  const stockKeys = new Set(stock.map((s) => s.key));

  let avoid = scored.scored
    .filter((r) => !stockKeys.has(r.key))
    .reverse()
    .slice(0, avoidN)
    .map((r) => toCombo(r, "avoid"));

  if (avoid.length === 0 && scored.scored.length >= 2) {
    avoid = scored.scored
      .slice(Math.ceil(scored.scored.length / 2))
      .reverse()
      .slice(0, avoidN)
      .filter(
        (r) =>
          !stockKeys.has(r.key) || stock.length > scored.scored.length / 2
      )
      .map((r) => toCombo(r, "avoid"));
  }

  return { stock, avoid };
}
