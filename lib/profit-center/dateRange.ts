/** Date range presets and resolvers for Profit Center. */

export type DatePreset =
  | "mtd"
  | "ytd"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "all_time"
  | "last_month"
  /** @deprecated kept for old URLs */
  | "month"
  | "custom";

export type DateRange = { from: string; to: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Format a local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(year: number, month1: number): Date {
  return new Date(year, month1 - 1, 1);
}

function endOfMonth(year: number, month1: number): Date {
  return new Date(year, month1, 0);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, d.getDate());
}

/**
 * Resolve a preset (or legacy month/custom) to inclusive sale_date bounds.
 * `now` defaults to today in the local timezone.
 */
export function resolveDateRange(
  preset: DatePreset,
  opts?: {
    now?: Date;
    /** 1-based month when preset === "month" */
    month?: number;
    year?: number;
    customFrom?: string;
    customTo?: string;
  }
): DateRange {
  const now = opts?.now ?? new Date();
  const today = toISODate(now);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  switch (preset) {
    case "mtd":
      return { from: toISODate(startOfMonth(y, m)), to: today };
    case "ytd":
      return { from: `${y}-01-01`, to: today };
    case "last_month": {
      const prev = addMonths(startOfMonth(y, m), -1);
      const py = prev.getFullYear();
      const pm = prev.getMonth() + 1;
      return {
        from: toISODate(startOfMonth(py, pm)),
        to: toISODate(endOfMonth(py, pm)),
      };
    }
    case "last_3_months":
      return {
        from: toISODate(addMonths(startOfMonth(y, m), -2)),
        to: today,
      };
    case "last_6_months":
      return {
        from: toISODate(addMonths(startOfMonth(y, m), -5)),
        to: today,
      };
    case "last_12_months":
      return {
        from: toISODate(addMonths(startOfMonth(y, m), -11)),
        to: today,
      };
    case "all_time":
      return { from: "2000-01-01", to: today };
    case "month": {
      const year = opts?.year ?? y;
      const month = opts?.month ?? m;
      return {
        from: toISODate(startOfMonth(year, month)),
        to: toISODate(endOfMonth(year, month)),
      };
    }
    case "custom": {
      const from = opts?.customFrom ?? today;
      const to = opts?.customTo ?? today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return { from: toISODate(startOfMonth(y, m)), to: today };
  }
}

/** Active UI presets (legacy month/custom omitted). */
export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "mtd", label: "MTD" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
  { value: "last_3_months", label: "Previous 3 months" },
  { value: "last_6_months", label: "Previous 6 months" },
  { value: "last_12_months", label: "Previous 12 months" },
  { value: "all_time", label: "All time" },
];

export const ACTIVE_DATE_PRESETS = new Set<DatePreset>(
  DATE_PRESET_OPTIONS.map((o) => o.value)
);
