import { effectiveGross, num } from "./cost";
import type { AcqPurchase } from "./types";

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
  return row.purchaseCount > 0 || row.salesCount > 0 || row.grossTotal !== 0;
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

/**
 * Purchase / sales unit volume and total gross profit for the last 12 months.
 * Empty months (no purchases, sales, or gross) are omitted.
 */
export function computeMonthlyPurchaseSalesVolume(
  purchases: AcqPurchase[],
  now = new Date()
): MonthlyVolumeRow[] {
  const keys = last12MonthKeys(now);
  const allowed = new Set(keys);
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
    });
  }

  for (const p of purchases) {
    const buyKey = monthKey(p.purchase_date);
    if (buyKey && allowed.has(buyKey)) {
      const row = buckets.get(buyKey)!;
      row.purchaseCount += 1;
      row.purchaseTotal += num(p.purchase_price);
    }

    const isSold = p.stage === "sold" || p.stage === "arbitration_complete";
    if (!isSold) continue;
    const sellKey = monthKey(p.sold_date);
    if (sellKey && allowed.has(sellKey)) {
      const row = buckets.get(sellKey)!;
      row.salesCount += 1;
      row.salesTotal += num(p.sold_price);
      const g = effectiveGross(p);
      if (g != null) row.grossTotal += g;
    }
  }

  return keys.map((k) => buckets.get(k)!).filter(hasMonthData);
}
