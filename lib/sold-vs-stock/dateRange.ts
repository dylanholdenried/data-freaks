/**
 * Date presets for Sold vs Stock (includes rolling 30/60/90 day windows).
 */

import {
  resolveDateRange as resolveProfitCenterRange,
  toISODate,
  type DateRange,
} from "@/lib/profit-center/dateRange";

export type SoldVsStockPreset =
  | "last_30_days"
  | "last_60_days"
  | "last_90_days"
  | "mtd"
  | "last_month"
  | "ytd"
  | "last_12_months";

export type { DateRange };

export const SOLD_VS_STOCK_PRESET_OPTIONS: {
  value: SoldVsStockPreset;
  label: string;
}[] = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_60_days", label: "Last 60 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "mtd", label: "MTD" },
  { value: "last_month", label: "Last month" },
  { value: "ytd", label: "YTD" },
  { value: "last_12_months", label: "T-12" },
];

export const ACTIVE_SOLD_VS_STOCK_PRESETS = new Set<SoldVsStockPreset>(
  SOLD_VS_STOCK_PRESET_OPTIONS.map((o) => o.value)
);

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function inclusiveDayCount(range: DateRange): number {
  const from = new Date(`${range.from}T12:00:00`);
  const to = new Date(`${range.to}T12:00:00`);
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function resolveSoldVsStockRange(
  preset: SoldVsStockPreset,
  now = new Date()
): DateRange {
  const today = toISODate(now);
  switch (preset) {
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_60_days":
      return { from: addDays(today, -59), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "mtd":
      return resolveProfitCenterRange("mtd", { now });
    case "last_month":
      return resolveProfitCenterRange("last_month", { now });
    case "ytd":
      return resolveProfitCenterRange("ytd", { now });
    case "last_12_months":
      return resolveProfitCenterRange("last_12_months", { now });
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** Prior window of equal length, ending the day before `range.from`. */
export function priorRangeFor(range: DateRange): DateRange {
  const days = inclusiveDayCount(range);
  const priorTo = addDays(range.from, -1);
  const priorFrom = addDays(priorTo, -(days - 1));
  return { from: priorFrom, to: priorTo };
}

export function windowDayCount(range: DateRange): number {
  return inclusiveDayCount(range);
}