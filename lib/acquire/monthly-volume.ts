import { effectiveGross, num } from "./cost";
import { totalPayableGross } from "./reported";
import { ACQ_COMPLETED_STAGES, type AcqPurchase, type AcqPurchaseStage } from "./types";

export type MonthlyVolumeRow = {
  /** YYYY-MM */
  month: string;
  /** Short axis label, e.g. "Apr '25" */
  label: string;
  purchaseTotal: number;
  purchaseCount: number;
  salesTotal: number;
  salesCount: number;
  /** Sum of effective gross for sold units in the month (by sold_date). */
  grossTotal: number;
  /**
   * Sum of Total Payable Gross (reported front + back + pack + buy fee)
   * for sold units in the month (by sold_date).
   */
  reportedGrossTotal: number;
};

/**
 * Sold internal transfer the viewer cannot see as a card (buying store is
 * outside their access) but should still credit to the retail store.
 */
export type InboundTransferCredit = {
  id: string;
  store_id: string | null;
  retail_store_id: string;
  sold_date: string | null;
  retail_sold_date: string | null;
  stage: AcqPurchaseStage | string;
  exit_strategy: "internal_transfer";
  next_store_profit: number | null;
};

function monthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function hasMonthData(row: MonthlyVolumeRow): boolean {
  return (
    row.purchaseCount > 0 ||
    row.salesCount > 0 ||
    row.grossTotal !== 0 ||
    row.reportedGrossTotal !== 0
  );
}

/** Last 12 calendar months (oldest → newest). */
export function last12MonthKeys(now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function creditTransferSale(
  buckets: Map<string, MonthlyVolumeRow>,
  allowedMonths: Set<string>,
  soldDate: string | null,
  nextStoreGross: number | null
) {
  const sellKey = monthKey(soldDate);
  if (!sellKey || !allowedMonths.has(sellKey)) return;
  const row = buckets.get(sellKey)!;
  row.salesCount += 1;
  if (nextStoreGross != null) row.grossTotal += num(nextStoreGross);
}

function isSoldStage(stage: AcqPurchaseStage | string): boolean {
  return (ACQ_COMPLETED_STAGES as readonly string[]).includes(stage);
}

function transferCreditsRetailStore(
  p: {
    store_id: string | null;
    exit_strategy?: string | null;
    retail_store_id: string | null;
    stage: AcqPurchaseStage | string;
  },
  selected: Set<string>
): boolean {
  return (
    p.exit_strategy === "internal_transfer" &&
    !!p.retail_store_id &&
    p.retail_store_id !== p.store_id &&
    selected.has(p.retail_store_id) &&
    isSoldStage(p.stage)
  );
}

/**
 * Purchase / sales unit volume, total gross, and reported (payable) gross for
 * the last 12 months. Empty months are omitted.
 *
 * A car's own purchase, sale, front/back gross, and reported payable gross stay
 * on the buying store. An internal transfer also counts as a sale on the retail
 * store in the month of its retail sold date (falling back to the buying store's
 * sold date), and that store's total gross bar includes next-store gross.
 */
export function computeMonthlyPurchaseSalesVolume(
  purchases: AcqPurchase[],
  selectedStoreIds: readonly string[],
  inboundCredits: InboundTransferCredit[] = [],
  now = new Date()
): MonthlyVolumeRow[] {
  const keys = last12MonthKeys(now);
  const allowedMonths = new Set(keys);
  const selected = new Set(selectedStoreIds);
  const buckets = new Map<string, MonthlyVolumeRow>();
  for (const month of keys) {
    buckets.set(month, {
      month,
      label: monthLabel(month),
      purchaseTotal: 0,
      purchaseCount: 0,
      salesTotal: 0,
      salesCount: 0,
      grossTotal: 0,
      reportedGrossTotal: 0,
    });
  }

  const seen = new Set<string>();

  for (const p of purchases) {
    seen.add(p.id);
    const ownStoreVisible = p.store_id == null || selected.has(p.store_id);

    if (ownStoreVisible) {
      const buyKey = monthKey(p.purchase_date);
      if (buyKey && allowedMonths.has(buyKey)) {
        const row = buckets.get(buyKey)!;
        row.purchaseCount += 1;
        row.purchaseTotal += num(p.purchase_price);
      }

      if (isSoldStage(p.stage)) {
        const sellKey = monthKey(p.sold_date);
        if (sellKey && allowedMonths.has(sellKey)) {
          const row = buckets.get(sellKey)!;
          row.salesCount += 1;
          row.salesTotal += num(p.sold_price);
          const g = effectiveGross(p);
          if (g != null) row.grossTotal += g;
          const reported = totalPayableGross(p);
          if (reported != null) row.reportedGrossTotal += reported;
        }
      }
    }

    if (transferCreditsRetailStore(p, selected)) {
      creditTransferSale(
        buckets,
        allowedMonths,
        p.retail_sold_date ?? p.sold_date,
        p.next_store_profit
      );
    }
  }

  for (const credit of inboundCredits) {
    if (seen.has(credit.id)) continue;
    if (!transferCreditsRetailStore(credit, selected)) continue;
    creditTransferSale(
      buckets,
      allowedMonths,
      credit.retail_sold_date ?? credit.sold_date,
      credit.next_store_profit
    );
  }

  return keys.map((k) => buckets.get(k)!).filter(hasMonthData);
}
