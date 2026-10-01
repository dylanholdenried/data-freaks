import { allInCost, effectiveGross, num } from "./cost";
import {
  ACQ_COMPLETED_STAGES,
  ACQ_EXIT_STRATEGIES,
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_LABELS,
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  type AcqExitStrategy,
  type AcqPurchase,
  type AcqPurchaseStage,
  type AcqSourceType,
} from "./types";

export type StageCount = { stage: AcqPurchaseStage; label: string; count: number };

export type SourcePerfRow = {
  source_type: AcqSourceType;
  label: string;
  soldCount: number;
  /** Prime + Subprime + Cash */
  retailLikeSoldCount: number;
  wholesaleExitSoldCount: number;
  transferSoldCount: number;
  arbExitSoldCount: number;
  avgGross: number | null;
  avgMmrSpread: number | null;
  avgJdSpread: number | null;
  arbOpenCount: number;
  arbCompleteCount: number;
};

export type ModelSpreadRow = {
  key: string;
  make: string;
  model: string;
  soldCount: number;
  avgSaleOverMmr: number | null;
  avgSaleOverJd: number | null;
  avgGross: number | null;
};

export type MonthlySoldRow = {
  month: string; // YYYY-MM
  count: number;
  totalGross: number;
  avgGross: number | null;
};

export type ExitStrategyCount = {
  strategy: AcqExitStrategy;
  label: string;
  count: number;
};

export type ReconStoreRow = {
  /** null = purchases not assigned to a store */
  storeId: string | null;
  storeName: string;
  /** Units with an actual recon cost entered */
  reconCount: number;
  totalRecon: number;
  avgRecon: number | null;
  /** Units with both an estimate and an actual (basis for variance) */
  comparedCount: number;
  avgEstimate: number | null;
  avgActualCompared: number | null;
  /** Avg (actual − estimate); positive = ran over estimate */
  avgVariance: number | null;
  /** Avg variance as % of estimate, across compared units with estimate > 0 */
  avgVariancePct: number | null;
  overCount: number;
  underCount: number;
};

export type AcquirePerformance = {
  stageCounts: StageCount[];
  soldThisMonth: number;
  avgGrossPerDeal: number | null;
  bySource: SourcePerfRow[];
  byModel: ModelSpreadRow[];
  soldByMonth: MonthlySoldRow[];
  byExitStrategy: ExitStrategyCount[];
  arbOpenCount: number;
  arbCompleteCount: number;
  wholesaleQueueCount: number;
  retailLikeSoldCount: number;
  wholesaleExitSoldCount: number;
  transferSoldCount: number;
};

function monthKey(dateStr: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function exitOf(p: AcqPurchase): AcqExitStrategy | null {
  const v = p.exit_strategy;
  if (v && (ACQ_EXIT_STRATEGIES as readonly string[]).includes(v)) {
    return v as AcqExitStrategy;
  }
  // Legacy values from older schema
  if (v === "retail") return "prime";
  if (v === "wholesale_sold") return "wholesale";
  return null;
}

function isRetailLike(exit: AcqExitStrategy | null): boolean {
  return exit === "prime" || exit === "subprime" || exit === "cash";
}

export function computeAcquirePerformance(
  purchases: AcqPurchase[],
  now = new Date()
): AcquirePerformance {
  const stageCounts: StageCount[] = ACQ_STAGES.map((stage) => ({
    stage,
    label: ACQ_STAGE_LABELS[stage],
    count: purchases.filter((p) => p.stage === stage).length,
  }));

  const sold = purchases.filter((p) => p.stage === "sold" || p.stage === "arbitration_complete");
  const thisMonth = currentMonthKey(now);
  const soldThisMonth = sold.filter((p) => monthKey(p.sold_date) === thisMonth).length;

  const grosses = sold
    .map((p) => effectiveGross(p))
    .filter((g): g is number => g != null);
  const avgGrossPerDeal = avg(grosses);

  const sources = new Set(purchases.map((p) => p.source_type));
  const bySource: SourcePerfRow[] = Array.from(sources)
    .sort()
    .map((source_type) => {
      const subset = purchases.filter((p) => p.source_type === source_type);
      const soldSub = subset.filter(
        (p) => p.stage === "sold" || p.stage === "arbitration_complete"
      );
      const mmrSpreads = soldSub
        .map((p) => {
          if (p.sold_price == null || p.purchase_mmr == null) return null;
          return num(p.sold_price) - num(p.purchase_mmr);
        })
        .filter((x): x is number => x != null);
      const jdSpreads = soldSub
        .map((p) => {
          if (p.sold_price == null || p.purchase_jd == null) return null;
          return num(p.sold_price) - num(p.purchase_jd);
        })
        .filter((x): x is number => x != null);
      const g = soldSub
        .map((p) => effectiveGross(p))
        .filter((x): x is number => x != null);
      return {
        source_type,
        label: ACQ_SOURCE_LABELS[source_type] ?? source_type,
        soldCount: soldSub.length,
        retailLikeSoldCount: soldSub.filter((p) => isRetailLike(exitOf(p))).length,
        wholesaleExitSoldCount: soldSub.filter((p) => exitOf(p) === "wholesale").length,
        transferSoldCount: soldSub.filter((p) => exitOf(p) === "internal_transfer").length,
        arbExitSoldCount: soldSub.filter((p) => exitOf(p) === "arbitrated").length,
        avgGross: avg(g),
        avgMmrSpread: avg(mmrSpreads),
        avgJdSpread: avg(jdSpreads),
        arbOpenCount: subset.filter((p) => p.stage === "arbitration").length,
        arbCompleteCount: subset.filter((p) => p.stage === "arbitration_complete").length,
      };
    });

  const modelMap = new Map<string, AcqPurchase[]>();
  for (const p of sold) {
    const make = (p.vehicle_make ?? "").trim() || "Unknown";
    const model = (p.vehicle_model ?? "").trim() || "Unknown";
    const key = `${make.toUpperCase()}|${model.toUpperCase()}`;
    const list = modelMap.get(key) ?? [];
    list.push(p);
    modelMap.set(key, list);
  }

  const byModel: ModelSpreadRow[] = Array.from(modelMap.entries())
    .map(([key, list]) => {
      const make = list[0]?.vehicle_make?.trim() || "Unknown";
      const model = list[0]?.vehicle_model?.trim() || "Unknown";
      const overMmr = list
        .map((p) =>
          p.sold_price != null && p.purchase_mmr != null
            ? num(p.sold_price) - num(p.purchase_mmr)
            : null
        )
        .filter((x): x is number => x != null);
      const overJd = list
        .map((p) =>
          p.sold_price != null && p.purchase_jd != null
            ? num(p.sold_price) - num(p.purchase_jd)
            : null
        )
        .filter((x): x is number => x != null);
      const g = list
        .map((p) => effectiveGross(p))
        .filter((x): x is number => x != null);
      return {
        key,
        make,
        model,
        soldCount: list.length,
        avgSaleOverMmr: avg(overMmr),
        avgSaleOverJd: avg(overJd),
        avgGross: avg(g),
      };
    })
    .sort((a, b) => (b.avgSaleOverMmr ?? -999999) - (a.avgSaleOverMmr ?? -999999));

  const monthMap = new Map<string, { count: number; grossSum: number; grossN: number }>();
  for (const p of sold) {
    const m = monthKey(p.sold_date);
    if (!m) continue;
    const row = monthMap.get(m) ?? { count: 0, grossSum: 0, grossN: 0 };
    row.count += 1;
    const g = effectiveGross(p);
    if (g != null) {
      row.grossSum += g;
      row.grossN += 1;
    }
    monthMap.set(m, row);
  }

  const soldByMonth: MonthlySoldRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, row]) => ({
      month,
      count: row.count,
      totalGross: row.grossSum,
      avgGross: row.grossN ? row.grossSum / row.grossN : null,
    }));

  const byExitStrategy: ExitStrategyCount[] = ACQ_EXIT_STRATEGIES.map((strategy) => ({
    strategy,
    label: ACQ_EXIT_STRATEGY_LABELS[strategy],
    count: sold.filter((p) => exitOf(p) === strategy).length,
  }));

  return {
    stageCounts,
    soldThisMonth,
    avgGrossPerDeal,
    bySource,
    byModel,
    soldByMonth,
    byExitStrategy,
    arbOpenCount: purchases.filter((p) => p.stage === "arbitration").length,
    arbCompleteCount: purchases.filter((p) => p.stage === "arbitration_complete").length,
    wholesaleQueueCount: purchases.filter((p) => p.stage === "wholesale").length,
    retailLikeSoldCount: sold.filter((p) => isRetailLike(exitOf(p))).length,
    wholesaleExitSoldCount: sold.filter((p) => exitOf(p) === "wholesale").length,
    transferSoldCount: sold.filter((p) => exitOf(p) === "internal_transfer").length,
  };
}

function reconRow(
  storeId: string | null,
  storeName: string,
  list: AcqPurchase[]
): ReconStoreRow {
  const actuals = list
    .filter((p) => p.recon_cost != null)
    .map((p) => num(p.recon_cost));
  const compared = list.filter((p) => p.recon_cost != null && p.recon_estimate != null);
  const estimates = compared.map((p) => num(p.recon_estimate));
  const comparedActuals = compared.map((p) => num(p.recon_cost));
  const variances = compared.map((p) => num(p.recon_cost) - num(p.recon_estimate));
  const variancePcts = compared
    .filter((p) => num(p.recon_estimate) > 0)
    .map((p) => (num(p.recon_cost) - num(p.recon_estimate)) / num(p.recon_estimate));
  return {
    storeId,
    storeName,
    reconCount: actuals.length,
    totalRecon: actuals.reduce((a, b) => a + b, 0),
    avgRecon: avg(actuals),
    comparedCount: compared.length,
    avgEstimate: avg(estimates),
    avgActualCompared: avg(comparedActuals),
    avgVariance: avg(variances),
    avgVariancePct: avg(variancePcts),
    overCount: variances.filter((v) => v > 0).length,
    underCount: variances.filter((v) => v < 0).length,
  };
}

/**
 * Recon cost by store: average actual recon, and how actuals compare to the
 * acquisition-time estimate. Returns per-store rows plus an all-stores total.
 */
export function computeReconByStore(
  purchases: AcqPurchase[],
  stores: { id: string; name: string }[]
): { rows: ReconStoreRow[]; total: ReconStoreRow } {
  const byStore = new Map<string | null, AcqPurchase[]>();
  for (const p of purchases) {
    const list = byStore.get(p.store_id) ?? [];
    list.push(p);
    byStore.set(p.store_id, list);
  }

  const rows: ReconStoreRow[] = stores
    .filter((s) => byStore.has(s.id))
    .map((s) => reconRow(s.id, s.name, byStore.get(s.id) ?? []));

  const unassigned = byStore.get(null);
  if (unassigned?.length) rows.push(reconRow(null, "Unassigned", unassigned));

  return {
    rows: rows.filter((r) => r.reconCount > 0),
    total: reconRow(null, "All selected stores", purchases),
  };
}

/** Helper for KPI all-in on detail / cards */
export { allInCost };
