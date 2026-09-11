export type PlanTier = "log" | "analyze";

export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === "analyze") return "analyze";
  // Legacy aliases
  if (plan === "advise" || plan === "paid" || plan === "premium") return "analyze";
  if (plan === "free") return "log";
  return "log";
}

export function canAccessProfitCenter(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === "analyze";
}

export function canAccessInventoryCommand(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === "analyze";
}

/** Buy-Box is an Acquire addon feature. */
export function canAccessBuyBox(acquireEnabled: boolean | null | undefined): boolean {
  return Boolean(acquireEnabled);
}

/** Acquire is an addon flag (group cache or per-store). */
export function canAccessAcquire(acquireEnabled: boolean | null | undefined): boolean {
  return Boolean(acquireEnabled);
}

/** Nav hrefs that require Analyze */
const ANALYZE_HREFS = new Set([
  "/app/profit-center",
  "/app/trades",
  "/app/inventory-command",
]);

/** Nav hrefs that require Acquire addon */
const ACQUIRE_HREFS = new Set([
  "/app/acquire/purchases",
  "/app/acquire/performance",
  "/app/buy-box",
]);

export function isAcquireNavHref(href: string): boolean {
  return (
    ACQUIRE_HREFS.has(href) ||
    href.startsWith("/app/acquire/") ||
    href.startsWith("/app/buy-box")
  );
}

export function requiredProductForHref(
  href: string
): "analyze" | "acquire" | null {
  if (isAcquireNavHref(href)) return "acquire";
  if (ANALYZE_HREFS.has(href) || href.startsWith("/app/profit-center") || href.startsWith("/app/trades") || href.startsWith("/app/inventory-command")) {
    return "analyze";
  }
  return null;
}

export function canAccessAppNav(
  plan: string | null | undefined,
  href: string,
  opts?: { acquireEnabled?: boolean | null }
): boolean {
  if (isAcquireNavHref(href)) return canAccessAcquire(opts?.acquireEnabled);
  if (
    ANALYZE_HREFS.has(href) ||
    href.startsWith("/app/profit-center") ||
    href.startsWith("/app/trades") ||
    href.startsWith("/app/inventory-command")
  ) {
    return canAccessProfitCenter(plan);
  }
  return true;
}

/** Whether a nav item should render unlocked or with a lock (still visible). */
export function navAccessState(
  plan: string | null | undefined,
  href: string,
  opts?: { acquireEnabled?: boolean | null }
): "open" | "locked" {
  return canAccessAppNav(plan, href, opts) ? "open" : "locked";
}
