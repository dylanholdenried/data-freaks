/** Store-level billing helpers (Phase 0 — no Stripe). */

export type StorePlanTier = "log" | "analyze";
export type BillingInterval = "monthly" | "annual";
export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export const DEFAULT_MONTHLY_PRICE_CENTS = 250_000;
export const ANNUAL_MONTHS_CHARGED = 10;

export type StoreBillingRow = {
  id: string;
  name: string;
  is_demo?: boolean | null;
  plan: string | null;
  acquire_enabled: boolean | null;
  billing_interval: string | null;
  billing_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  bulk_import_window_ends_at: string | null;
  activation_fee_paid_at: string | null;
  monthly_price_cents: number | null;
};

export function normalizeStorePlan(plan: string | null | undefined): StorePlanTier {
  if (plan === "analyze" || plan === "advise" || plan === "paid" || plan === "premium") {
    return "analyze";
  }
  return "log";
}

export function effectiveGroupPlanFromStores(
  stores: Array<{ plan?: string | null; is_active?: boolean | null }>
): StorePlanTier {
  const active = stores.filter((s) => s.is_active !== false);
  return active.some((s) => normalizeStorePlan(s.plan) === "analyze") ? "analyze" : "log";
}

export function effectiveAcquireFromStores(
  stores: Array<{ acquire_enabled?: boolean | null; is_active?: boolean | null }>
): boolean {
  return stores.some((s) => s.is_active !== false && Boolean(s.acquire_enabled));
}

export function formatMoneyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function annualPriceCents(monthlyCents: number): number {
  return monthlyCents * ANNUAL_MONTHS_CHARGED;
}

export function billingStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "trialing":
      return "Trial";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "none":
    default:
      return "Log (free)";
  }
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function addDaysIso(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
