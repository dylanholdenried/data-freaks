"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toggleCalendarDay } from "@/app/app/actions";
import {
  MONTH_NAMES,
  countWorkingDaysForStore,
  getCentralDateString,
  getCentralTimeParts,
  isDayCompleted,
  isWorkingDayForStore,
  msUntilNextSixPmCentral,
  type CalendarDay,
} from "@/lib/dashboard/pace";
import { cn } from "@/lib/utils";

export type CalendarStore = { id: string; name: string };
export type CalendarDepartment = { id: string; name: string; store_id: string };
export type BookedDeal = {
  store_id: string;
  department_id: string;
  sale_date: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  stores: CalendarStore[];
  departments: CalendarDepartment[];
  calendarDays: CalendarDay[];
  deals: BookedDeal[];
  year: number;
  month: number;
  readOnly?: boolean;
};

function formatYm(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function overrideKey(storeId: string, date: string) {
  return `${storeId}|${date}`;
}

export default function CalendarClient({
  stores,
  departments,
  calendarDays,
  deals,
  year,
  month,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [clockTick, setClockTick] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>(
    {}
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalOverrides({});
  }, [calendarDays, year, month]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = msUntilNextSixPmCentral();
      timeoutId = setTimeout(() => {
        setClockTick((t) => t + 1);
        schedule();
      }, Math.max(ms, 1_000));
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  const ct = useMemo(() => getCentralTimeParts(), [clockTick]);
  const todayStr = getCentralDateString(ct);

  const effectiveCalendarDays = useMemo(() => {
    const byKey = new Map<string, CalendarDay>();
    for (const day of calendarDays) {
      const date = day.date.slice(0, 10);
      byKey.set(overrideKey(day.store_id, date), {
        ...day,
        date,
      });
    }
    for (const [key, isWorkingDay] of Object.entries(localOverrides)) {
      const [storeId, date] = key.split("|");
      byKey.set(key, {
        store_id: storeId,
        date,
        is_working_day: isWorkingDay,
      });
    }
    return Array.from(byKey.values());
  }, [calendarDays, localOverrides]);

  const overridesByStore = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    for (const store of stores) map.set(store.id, new Map());
    for (const day of effectiveCalendarDays) {
      const m = map.get(day.store_id);
      if (m) m.set(day.date.slice(0, 10), day.is_working_day);
    }
    return map;
  }, [stores, effectiveCalendarDays]);

  const deptsByStore = useMemo(() => {
    const map = new Map<string, CalendarDepartment[]>();
    for (const store of stores) map.set(store.id, []);
    for (const dept of departments) {
      const list = map.get(dept.store_id);
      if (list) list.push(dept);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [stores, departments]);

  const countsByStoreDateDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const deal of deals) {
      const date = deal.sale_date.slice(0, 10);
      const key = `${deal.store_id}|${date}|${deal.department_id}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [deals]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();

  const yearOptions = useMemo(() => {
    const base = ct.year;
    const years: number[] = [];
    for (let y = base - 3; y <= base + 2; y++) years.push(y);
    if (!years.includes(year)) years.push(year);
    return years.sort((a, b) => a - b);
  }, [ct.year, year]);

  function goTo(nextYear: number, nextMonth: number) {
    router.replace(`/app/calendar?ym=${formatYm(nextYear, nextMonth)}`);
  }

  function handleToggle(storeId: string, dateStr: string, currentlyOpen: boolean) {
    if (readOnly) return;
    const key = overrideKey(storeId, dateStr);
    if (pendingKey === key) return;

    const nextOpen = !currentlyOpen;
    setLocalOverrides((prev) => ({ ...prev, [key]: nextOpen }));
    setPendingKey(key);

    startTransition(async () => {
      try {
        await toggleCalendarDay(storeId, dateStr, nextOpen);
        router.refresh();
      } catch {
        setLocalOverrides((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      } finally {
        setPendingKey((current) => (current === key ? null : current));
      }
    });
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Operating days</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? "View operating days for your assigned stores. Days complete automatically at 6:00 PM Central for pace."
            : "Click a day to mark it open or closed. Days complete automatically at 6:00 PM Central for pace."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(prev.year, prev.month)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <select
            value={month}
            onChange={(e) => goTo(year, Number(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            aria-label="Month"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => goTo(Number(e.target.value), month)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            aria-label="Year"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => goTo(next.year, next.month)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {stores.length === 0 && (
        <section className="app-panel p-5">
          <p className="text-sm text-muted-foreground">
            No stores available for your account.
          </p>
        </section>
      )}

      {stores.map((store) => {
        const overrides = overridesByStore.get(store.id) ?? new Map();
        const storeDepts = deptsByStore.get(store.id) ?? [];
        const workingCount = countWorkingDaysForStore(
          year,
          month,
          store.id,
          effectiveCalendarDays
        );

        const cells: ReactNode[] = [];
        for (let i = 0; i < firstDow; i++) {
          cells.push(
            <div
              key={`pad-${store.id}-${i}`}
              className="min-h-[5.5rem] rounded-md bg-transparent"
            />
          );
        }

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow = new Date(year, month - 1, day).getDay();
          const open = isWorkingDayForStore(dow, dateStr, overrides);
          const isToday = dateStr === todayStr;
          const completed = isDayCompleted(dateStr, ct);
          const key = overrideKey(store.id, dateStr);
          const busy = pendingKey === key && isPending;

          cells.push(
            <button
              key={`${store.id}-${dateStr}`}
              type="button"
              onClick={() => handleToggle(store.id, dateStr, open)}
              disabled={busy || readOnly}
              aria-pressed={open}
              aria-label={
                readOnly
                  ? `${dateStr}, ${open ? "open" : "closed"}`
                  : `${dateStr}, ${open ? "open" : "closed"}. Click to toggle.`
              }
              className={cn(
                "relative min-h-[5.5rem] w-full overflow-hidden rounded-md border p-1.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--da-blue)] disabled:opacity-70",
                !readOnly && "hover:brightness-110",
                open
                  ? "border-[color-mix(in_srgb,var(--da-green)_35%,var(--da-line))] bg-[color-mix(in_srgb,var(--da-green)_18%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--da-red)_35%,var(--da-line))] bg-[color-mix(in_srgb,var(--da-red)_18%,transparent)]",
                isToday &&
                  "outline outline-2 outline-offset-1 outline-[var(--da-amber)]",
                readOnly && "cursor-default"
              )}
            >
              <div className="relative z-[1] flex items-start justify-between gap-1">
                <span className="text-xs font-semibold text-foreground">
                  {day}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {open ? "Open" : "Closed"}
                </span>
              </div>
              <div className="relative z-[1] mt-1 space-y-0.5">
                {storeDepts.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No depts</p>
                ) : (
                  storeDepts.map((dept) => {
                    const count =
                      countsByStoreDateDept.get(
                        `${store.id}|${dateStr}|${dept.id}`
                      ) ?? 0;
                    return (
                      <div
                        key={dept.id}
                        className="flex items-center justify-between gap-1 text-[10px] leading-tight text-foreground"
                      >
                        <span className="truncate text-muted-foreground">
                          {dept.name}
                        </span>
                        <span className="tabular-nums font-medium">{count}</span>
                      </div>
                    );
                  })
                )}
              </div>
              {completed && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-[2]"
                  style={{
                    background:
                      "linear-gradient(to top left, transparent calc(50% - 1px), color-mix(in srgb, var(--da-text) 55%, transparent) 50%, transparent calc(50% + 1px))",
                  }}
                />
              )}
            </button>
          );
        }

        return (
          <section key={store.id} className="app-panel space-y-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {store.name}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  This month has {workingCount} working day
                  {workingCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[color-mix(in_srgb,var(--da-green)_55%,transparent)]" />
                  Open
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[color-mix(in_srgb,var(--da-red)_55%,transparent)]" />
                  Closed
                </span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((label) => (
                <div
                  key={`${store.id}-${label}`}
                  className="px-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </div>
              ))}
              {cells}
            </div>
          </section>
        );
      })}
    </div>
  );
}
