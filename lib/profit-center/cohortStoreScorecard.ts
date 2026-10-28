/**
 * Per-store buy-box ranking + sold-vs-stock actions for a model cohort.
 */

import {
  aggregateByDimension,
  buildTradesByDeal,
  type ProfitDeal,
  type ProfitTrade,
  type RollupRow,
} from "./aggregate";
import {
  scoreBuyBox,
  type BuyBoxSettings,
  type ScoredModel,
} from "./buyBox";
import { filterModelInventoryUnits } from "./inventoryBridge";
import type { InvUnitWithStore } from "./loadInventory";
import { classifyAction } from "@/lib/sold-vs-stock/aggregate";
import type { StockAction } from "@/lib/sold-vs-stock/types";

export type StoreScorecardRow = {
  storeId: string;
  storeName: string;
  sold: number;
  onLot: number;
  gap: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgAge: number | null;
  tradePct: number | null;
  /** Buy-box score when volume meets minVolume; else null. */
  score: number | null;
  meetsMinVolume: boolean;
  action: StockAction;
  actionWhy: string;
  isBestScore: boolean;
  isStrongestNeedMore: boolean;
  isStrongestTooMuch: boolean;
};

function emptyCtx(deals: ProfitDeal[], tradesByDeal: Map<string, ProfitTrade[]>) {
  return {
    deals,
    tradesByDeal,
    dealSalespeople: [] as { deal_id: string; salesperson_id: string; share_percent: number }[],
    salespersonNames: new Map<string, string>(),
    departmentNames: new Map<string, string>(),
  };
}

function rollupForStore(
  storeId: string,
  storeName: string,
  deals: ProfitDeal[],
  tradesByDeal: Map<string, ProfitTrade[]>
): RollupRow {
  const total = aggregateByDimension(
    "model",
    emptyCtx(deals, tradesByDeal)
  ).total;
  return {
    ...total,
    key: storeId,
    label: storeName,
    isTotal: false,
  };
}

function onLotStats(units: InvUnitWithStore[]): {
  count: number;
  avgAge: number | null;
} {
  if (units.length === 0) return { count: 0, avgAge: null };
  const ages = units
    .map((u) => u.age)
    .filter((a): a is number => a != null && Number.isFinite(a));
  const avgAge =
    ages.length === 0
      ? null
      : ages.reduce((s, a) => s + a, 0) / ages.length;
  return { count: units.length, avgAge };
}

export function buildStoreScorecard(opts: {
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  stores: { id: string; name: string }[];
  inventoryUnits: InvUnitWithStore[];
  make: string;
  model: string;
  buyBoxSettings: BuyBoxSettings;
}): StoreScorecardRow[] {
  const {
    deals,
    trades,
    stores,
    inventoryUnits,
    make,
    model,
    buyBoxSettings,
  } = opts;

  const tradesByDeal = buildTradesByDeal(trades);
  const storeNames = new Map(stores.map((s) => [s.id, s.name] as const));
  const matchedInv = filterModelInventoryUnits(inventoryUnits, make, model);

  const dealsByStore = new Map<string, ProfitDeal[]>();
  for (const d of deals) {
    const list = dealsByStore.get(d.store_id) ?? [];
    list.push(d);
    dealsByStore.set(d.store_id, list);
  }

  const invByStore = new Map<string, InvUnitWithStore[]>();
  for (const u of matchedInv) {
    const list = invByStore.get(u.store_id) ?? [];
    list.push(u);
    invByStore.set(u.store_id, list);
  }

  // When deals are single-store scoped, keep the scorecard on that store only.
  // Multi-store (or empty) deal sets also surface inventory-only rooftops.
  const storeIds = new Set<string>([...dealsByStore.keys()]);
  if (dealsByStore.size !== 1) {
    for (const id of invByStore.keys()) storeIds.add(id);
  }

  const rollupRows: RollupRow[] = [];
  const baseMeta = new Map<
    string,
    {
      storeName: string;
      sold: number;
      onLot: number;
      avgAgeOnLot: number | null;
      rollup: RollupRow;
    }
  >();

  for (const storeId of storeIds) {
    const storeDeals = dealsByStore.get(storeId) ?? [];
    const storeName = storeNames.get(storeId) ?? "Unknown";
    const lot = onLotStats(invByStore.get(storeId) ?? []);
    const rollup = rollupForStore(
      storeId,
      storeName,
      storeDeals,
      tradesByDeal
    );
    rollupRows.push(rollup);
    baseMeta.set(storeId, {
      storeName,
      sold: storeDeals.length,
      onLot: lot.count,
      avgAgeOnLot: lot.avgAge,
      rollup,
    });
  }

  const scored = scoreBuyBox(rollupRows, buyBoxSettings);
  const scoredByKey = new Map<string, ScoredModel>(
    scored.scored.map((r) => [r.key, r])
  );
  const minVol = Math.max(1, Math.floor(buyBoxSettings.minVolume) || 3);

  type Draft = StoreScorecardRow & { urgency: number };
  const drafts: Draft[] = [];

  for (const [storeId, meta] of baseMeta) {
    const scoredRow = scoredByKey.get(storeId);
    const meetsMinVolume = meta.sold >= minVol;
    const classified = classifyAction({
      sold: meta.sold,
      onLot: meta.onLot,
      avgAge: meta.avgAgeOnLot,
    });
    drafts.push({
      storeId,
      storeName: meta.storeName,
      sold: meta.sold,
      onLot: meta.onLot,
      gap: meta.sold - meta.onLot,
      avgFront: meta.rollup.avgFront,
      avgBack: meta.rollup.avgBack,
      avgTotal: meta.rollup.avgTotal,
      avgAge: meta.rollup.avgAge,
      tradePct: meta.rollup.tradePct,
      score: scoredRow?.score ?? null,
      meetsMinVolume,
      action: classified.action,
      actionWhy: classified.why,
      isBestScore: false,
      isStrongestNeedMore: false,
      isStrongestTooMuch: false,
      urgency: classified.urgency,
    });
  }

  // Sort: scored (meet min) by score desc, then under-min by volume desc
  drafts.sort((a, b) => {
    if (a.meetsMinVolume && !b.meetsMinVolume) return -1;
    if (!a.meetsMinVolume && b.meetsMinVolume) return 1;
    if (a.meetsMinVolume && b.meetsMinVolume) {
      const as = a.score ?? 0;
      const bs = b.score ?? 0;
      if (bs !== as) return bs - as;
    }
    if (b.sold !== a.sold) return b.sold - a.sold;
    return a.storeName.localeCompare(b.storeName);
  });

  const bestScored = drafts.find((d) => d.meetsMinVolume && d.score != null);
  if (bestScored) bestScored.isBestScore = true;

  let strongestNeed: Draft | null = null;
  let strongestTooMuch: Draft | null = null;
  for (const d of drafts) {
    if (d.action === "need_more") {
      if (!strongestNeed || d.urgency > strongestNeed.urgency) {
        strongestNeed = d;
      }
    }
    if (d.action === "too_much") {
      if (!strongestTooMuch || d.urgency > strongestTooMuch.urgency) {
        strongestTooMuch = d;
      }
    }
  }
  if (strongestNeed) strongestNeed.isStrongestNeedMore = true;
  if (strongestTooMuch) strongestTooMuch.isStrongestTooMuch = true;

  return drafts.map(({ urgency, ...row }) => {
    void urgency;
    return row;
  });
}
