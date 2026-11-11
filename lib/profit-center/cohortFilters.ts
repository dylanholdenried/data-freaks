/**
 * Multi-select dial-in filters for Profit Center cohort deals.
 */

import { financeLabel } from "@/lib/dashboard/pace";
import type { ProfitDeal } from "./aggregate";

export type CohortDialInFilters = {
  storeIds: string[];
  years: number[];
  trims: string[];
  financeTypes: string[];
  acquisitions: string[];
};

export type CohortFilterOption = {
  value: string;
  label: string;
  count: number;
};

export const EMPTY_DIAL_IN: CohortDialInFilters = {
  storeIds: [],
  years: [],
  trims: [],
  financeTypes: [],
  acquisitions: [],
};

/** Empty / missing acquisition_source filter value. */
export const UNKNOWN_ACQUISITION = "(Unknown)";

export function acquisitionFilterKey(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : UNKNOWN_ACQUISITION;
}

/** Empty trim display / filter value. */
export const BLANK_TRIM = "(Blank)";

/** Empty / missing finance_type filter value. */
export const UNSPECIFIED_FINANCE = "unspecified";

export function financeFilterKey(raw: string | null | undefined): string {
  const t = raw?.trim().toLowerCase();
  return t && t.length > 0 ? t : UNSPECIFIED_FINANCE;
}

export function trimFilterKey(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : BLANK_TRIM;
}

export function hasActiveDialIn(f: CohortDialInFilters): boolean {
  return (
    f.storeIds.length > 0 ||
    f.years.length > 0 ||
    f.trims.length > 0 ||
    f.financeTypes.length > 0 ||
    f.acquisitions.length > 0
  );
}

export function applyCohortDealFilters(
  deals: ProfitDeal[],
  filters: CohortDialInFilters
): ProfitDeal[] {
  const storeSet =
    filters.storeIds.length > 0 ? new Set(filters.storeIds) : null;
  const yearSet =
    filters.years.length > 0 ? new Set(filters.years) : null;
  const trimSet =
    filters.trims.length > 0
      ? new Set(filters.trims.map((t) => t.toLowerCase()))
      : null;
  const financeSet =
    filters.financeTypes.length > 0
      ? new Set(filters.financeTypes.map((f) => f.toLowerCase()))
      : null;
  const acquisitionSet =
    filters.acquisitions.length > 0
      ? new Set(filters.acquisitions.map((a) => a.toLowerCase()))
      : null;

  return deals.filter((d) => {
    if (storeSet && !storeSet.has(d.store_id)) return false;
    if (yearSet && !yearSet.has(d.vehicle_year)) return false;
    if (trimSet) {
      const key = trimFilterKey(d.trim).toLowerCase();
      if (!trimSet.has(key)) return false;
    }
    if (financeSet) {
      if (!financeSet.has(financeFilterKey(d.finance_type))) return false;
    }
    if (acquisitionSet) {
      if (!acquisitionSet.has(acquisitionFilterKey(d.acquisition_source).toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

function countMapIncrement(
  map: Map<string, { label: string; count: number }>,
  value: string,
  label: string
) {
  const existing = map.get(value);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(value, { label, count: 1 });
  }
}

export function buildStoreFilterOptions(
  deals: ProfitDeal[],
  storeNames: Map<string, string>
): CohortFilterOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    countMapIncrement(
      map,
      d.store_id,
      storeNames.get(d.store_id) ?? "Unknown"
    );
  }
  return [...map.entries()]
    .map(([value, v]) => ({ value, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildYearFilterOptions(
  deals: ProfitDeal[]
): CohortFilterOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    const y = d.vehicle_year;
    if (!y) continue;
    const key = String(y);
    countMapIncrement(map, key, key);
  }
  return [...map.entries()]
    .map(([value, v]) => ({ value, label: v.label, count: v.count }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

export function buildTrimFilterOptions(
  deals: ProfitDeal[]
): CohortFilterOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    const label = trimFilterKey(d.trim);
    countMapIncrement(map, label.toLowerCase(), label);
  }
  return [...map.entries()]
    .map(([, v]) => ({
      value: v.label,
      label: v.label,
      count: v.count,
    }))
    .sort((a, b) => {
      if (a.label === BLANK_TRIM) return 1;
      if (b.label === BLANK_TRIM) return -1;
      return a.label.localeCompare(b.label);
    });
}

export function buildFinanceFilterOptions(
  deals: ProfitDeal[]
): CohortFilterOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    const key = financeFilterKey(d.finance_type);
    const label =
      key === UNSPECIFIED_FINANCE
        ? "Unspecified"
        : financeLabel(d.finance_type);
    countMapIncrement(map, key, label);
  }
  return [...map.entries()]
    .map(([value, v]) => ({ value, label: v.label, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildAcquisitionFilterOptions(
  deals: ProfitDeal[]
): CohortFilterOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    const label = acquisitionFilterKey(d.acquisition_source);
    countMapIncrement(map, label.toLowerCase(), label);
  }
  return [...map.entries()]
    .map(([, v]) => ({
      value: v.label,
      label: v.label,
      count: v.count,
    }))
    .sort((a, b) => {
      if (a.label === UNKNOWN_ACQUISITION) return 1;
      if (b.label === UNKNOWN_ACQUISITION) return -1;
      return a.label.localeCompare(b.label);
    });
}

function parseCsv(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read dial-in filters from URL search params. */
export function parseDialInFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): CohortDialInFilters {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      return params.get(key) ?? undefined;
    }
    const v = params[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  const years = parseCsv(get("years"))
    .map((y) => Number(y))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    storeIds: parseCsv(get("stores")),
    years,
    trims: parseCsv(get("trims")),
    financeTypes: parseCsv(get("finance")).map((f) => f.toLowerCase()),
    acquisitions: parseCsv(get("acq")),
  };
}

/** Serialize dial-in filters onto an existing URLSearchParams (mutates). */
export function writeDialInToSearchParams(
  q: URLSearchParams,
  filters: CohortDialInFilters
): void {
  if (filters.storeIds.length > 0) {
    q.set("stores", filters.storeIds.join(","));
  } else {
    q.delete("stores");
  }
  if (filters.years.length > 0) {
    q.set("years", filters.years.join(","));
  } else {
    q.delete("years");
  }
  if (filters.trims.length > 0) {
    q.set("trims", filters.trims.join(","));
  } else {
    q.delete("trims");
  }
  if (filters.financeTypes.length > 0) {
    q.set("finance", filters.financeTypes.join(","));
  } else {
    q.delete("finance");
  }
  if (filters.acquisitions.length > 0) {
    q.set("acq", filters.acquisitions.join(","));
  } else {
    q.delete("acq");
  }
}

export function toggleInList<T extends string | number>(
  list: T[],
  value: T
): T[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}
