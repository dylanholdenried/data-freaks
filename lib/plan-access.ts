export type PlanTier = "log" | "analyze" | "advise";

export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === "analyze" || plan === "advise" || plan === "log") return plan;
  // Legacy aliases if migration not yet applied
  if (plan === "paid") return "analyze";
  if (plan === "premium") return "advise";
  if (plan === "free") return "log";
  return "log";
}

export function canAccessProfitCenter(plan: string | null | undefined): boolean {
  const p = normalizePlan(plan);
  return p === "analyze" || p === "advise";
}

export function canAccessInventoryCommand(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === "advise";
}

/** Buy-Box is an Advise-tier feature (same gate as Inventory Command). */
export function canAccessBuyBox(plan: string | null | undefined): boolean {
  return canAccessInventoryCommand(plan);
}

/** Acquire is an addon flag on dealer_groups (not a plan tier). */
export function canAccessAcquire(acquireEnabled: boolean | null | undefined): boolean {
  return Boolean(acquireEnabled);
}

/** Nav hrefs that require Analyze+ */
const ANALYZE_HREFS = new Set([
  "/app/profit-center",
  "/app/salesperson-leaderboard",
  "/app/trades",
]);

/** Nav hrefs that require Advise */
const ADVISE_HREFS = new Set(["/app/inventory-command", "/app/buy-box"]);

/** Nav hrefs that require Acquire addon */
const ACQUIRE_HREFS = new Set(["/app/acquire/purchases", "/app/acquire/performance"]);

export function isAcquireNavHref(href: string): boolean {
  return ACQUIRE_HREFS.has(href) || href.startsWith("/app/acquire/");
}

export function canAccessAppNav(
  plan: string | null | undefined,
  href: string,
  opts?: { acquireEnabled?: boolean | null }
): boolean {
  if (isAcquireNavHref(href)) return canAccessAcquire(opts?.acquireEnabled);
  if (ADVISE_HREFS.has(href)) return canAccessInventoryCommand(plan);
  if (ANALYZE_HREFS.has(href)) return canAccessProfitCenter(plan);
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
