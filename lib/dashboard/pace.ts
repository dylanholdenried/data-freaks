export type CalendarDay = {
  date: string;
  is_working_day: boolean;
  store_id: string;
};

export type NeededDisplay =
  | { kind: "empty" }
  | { kind: "surplus"; units: number }
  | { kind: "rate"; rate: number };

/** Current date/time parts in America/Chicago. */
export function getCentralTimeParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

export function isFiDepartment(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, "");
  return n === "f&i" || n === "fi" || /^f&i/.test(n);
}

function isWorkingDayForStore(
  dow: number,
  dateStr: string,
  overrides: Map<string, boolean>
): boolean {
  if (overrides.has(dateStr)) return overrides.get(dateStr)!;
  return dow >= 1 && dow <= 6;
}

/** Working day strings (YYYY-MM-DD) for selected stores (union). */
export function computeWorkingDays(
  year: number,
  month: number,
  calendarDays: CalendarDay[],
  selectedStoreIds: string[]
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const byStore = new Map<string, Map<string, boolean>>();
  for (const sid of selectedStoreIds) byStore.set(sid, new Map());
  for (const day of calendarDays) {
    const m = byStore.get(day.store_id);
    if (m) m.set(day.date.slice(0, 10), day.is_working_day);
  }
  const result: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const working = selectedStoreIds.some((sid) =>
      isWorkingDayForStore(dow, dateStr, byStore.get(sid) ?? new Map())
    );
    if (working) result.push(dateStr);
  }
  return result;
}

export function computeNeeded(
  sold: number,
  goal: number | null,
  remainingDays: number
): NeededDisplay {
  if (goal === null) return { kind: "empty" };
  if (sold >= goal) return { kind: "surplus", units: sold - goal };
  if (remainingDays <= 0) return { kind: "empty" };
  return { kind: "rate", rate: (goal - sold) / remainingDays };
}

export type PaceSnapshot = {
  totalWorkingDays: number;
  completedWorkingDays: number;
  remainingWorkingDays: number;
  paceLineToday: number | null;
  monthEndProjection: number | null;
  vsPace: number | null;
  projectionVsGoal: number | null;
  needed: NeededDisplay;
  toGo: number | null;
};

/**
 * Pace for a department (or any sold/goal pair).
 * Past months freeze at month end (completed = total).
 */
export function computePaceSnapshot(
  sold: number,
  goal: number | null,
  year: number,
  month: number,
  workingDays: string[],
  isCurrentMonth: boolean,
  isFutureMonth: boolean
): PaceSnapshot {
  const totalWorkingDays = workingDays.length;
  const ct = getCentralTimeParts();
  const todayStr = `${ct.year}-${String(ct.month).padStart(2, "0")}-${String(ct.day).padStart(2, "0")}`;
  const pastSixPM = ct.hour >= 18;

  let completedWorkingDays: number;
  if (isFutureMonth) {
    completedWorkingDays = 0;
  } else if (!isCurrentMonth) {
    // Past month — freeze at month end
    completedWorkingDays = totalWorkingDays;
  } else {
    completedWorkingDays = workingDays.filter(
      (ds) => ds < todayStr || (ds === todayStr && pastSixPM)
    ).length;
  }

  const remainingWorkingDays = Math.max(0, totalWorkingDays - completedWorkingDays);

  const paceLineToday =
    goal !== null && totalWorkingDays > 0
      ? Math.round((goal * completedWorkingDays) / totalWorkingDays)
      : null;

  const monthEndProjection =
    completedWorkingDays > 0
      ? Math.round((sold / completedWorkingDays) * totalWorkingDays)
      : null;

  const vsPace =
    paceLineToday !== null ? sold - paceLineToday : null;

  const projectionVsGoal =
    monthEndProjection !== null && goal !== null
      ? monthEndProjection - goal
      : null;

  const toGo = goal !== null ? goal - sold : null;

  return {
    totalWorkingDays,
    completedWorkingDays,
    remainingWorkingDays,
    paceLineToday,
    monthEndProjection,
    vsPace,
    projectionVsGoal,
    needed: computeNeeded(sold, goal, remainingWorkingDays),
    toGo,
  };
}

export function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtUnits(v: number): string {
  return v === Math.floor(v) ? String(Math.floor(v)) : v.toFixed(1);
}

export function formatSigned(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function financeLabel(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Unspecified";
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    prime: "Prime",
    subprime: "Subprime",
    cash: "Cash",
    lease: "Lease",
  };
  return map[key] ?? raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
