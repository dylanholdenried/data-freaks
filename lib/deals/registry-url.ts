/** Build / parse Sales Registry URLs so filters survive edit round-trips. */

export const DEALS_REGISTRY_RETURN_KEY = "deals-registry-return";

export type DealsRegistryFilters = {
  status?: string;
  store?: string;
  department?: string;
  rollup?: boolean;
  allTime?: boolean;
  year?: number;
  month?: number;
  day?: number | null;
  salesperson?: string;
  financeManager?: string;
  financeType?: string;
  q?: string;
};

export function buildDealsRegistryPath(filters: DealsRegistryFilters): string {
  const p = new URLSearchParams();

  if (filters.status && filters.status !== "all") {
    p.set("status", filters.status);
  }
  if (filters.store && filters.store !== "both") {
    p.set("store", filters.store);
  }
  if (filters.department) {
    p.set("department", filters.department);
    if (filters.rollup) p.set("rollup", "1");
  }
  if (filters.allTime) {
    p.set("all", "1");
  } else {
    if (filters.year != null) p.set("year", String(filters.year));
    if (filters.month != null) p.set("month", String(filters.month));
    if (filters.day != null) p.set("day", String(filters.day));
  }
  if (filters.salesperson) p.set("sp", filters.salesperson);
  if (filters.financeManager) p.set("fm", filters.financeManager);
  if (filters.financeType) p.set("ft", filters.financeType);
  if (filters.q?.trim()) p.set("q", filters.q.trim());

  const qs = p.toString();
  return qs ? `/app/deals?${qs}` : "/app/deals";
}

/** Only allow return paths back to the Sales Registry list (open-redirect safe). */
export function safeDealsReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/app/deals";

  let value = raw.trim();
  try {
    // Decode repeatedly in case the value was encoded more than once.
    for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(value); i++) {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    }
  } catch {
    return "/app/deals";
  }

  if (value === "/app/deals" || value.startsWith("/app/deals?")) {
    return value;
  }
  return "/app/deals";
}

export function rememberDealsRegistryPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DEALS_REGISTRY_RETURN_KEY, safeDealsReturnTo(path));
  } catch {
    /* private mode / quota */
  }
}

export function readRememberedDealsRegistryPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(DEALS_REGISTRY_RETURN_KEY);
  } catch {
    return null;
  }
}

/** Prefer explicit returnTo, then session memory, then bare registry. */
export function resolveDealsReturnTo(explicit?: string | null): string {
  if (explicit && explicit.startsWith("/app/deals?")) {
    return safeDealsReturnTo(explicit);
  }
  const remembered = readRememberedDealsRegistryPath();
  if (remembered) return safeDealsReturnTo(remembered);
  return safeDealsReturnTo(explicit);
}
