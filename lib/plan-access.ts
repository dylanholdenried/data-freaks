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

/** Nav hrefs that require Analyze+ */
const ANALYZE_HREFS = new Set(["/app/profit-center"]);

/** Nav hrefs that require Advise */
const ADVISE_HREFS = new Set(["/app/inventory-command"]);

export function canAccessAppNav(
  plan: string | null | undefined,
  href: string
): boolean {
  if (ADVISE_HREFS.has(href)) return canAccessInventoryCommand(plan);
  if (ANALYZE_HREFS.has(href)) return canAccessProfitCenter(plan);
  return true;
}
