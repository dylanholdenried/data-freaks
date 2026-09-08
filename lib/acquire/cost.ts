import type { AcqPurchase, AcqPurchaseStage } from "./types";
import { isCompletedStage } from "./types";

export function num(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(Number(n))) return 0;
  return Number(n);
}

export function allInCost(
  p: Pick<
    AcqPurchase,
    "purchase_price" | "auction_fees" | "transport_cost" | "recon_cost" | "recon_estimate"
  >
): number | null {
  const parts = [p.purchase_price, p.auction_fees, p.transport_cost, p.recon_cost ?? p.recon_estimate];
  if (parts.every((x) => x == null)) return null;
  return parts.reduce<number>((sum, x) => sum + num(x), 0);
}

export function effectiveGross(
  p: Pick<AcqPurchase, "total_gross" | "front_gross" | "back_gross">
): number | null {
  if (p.total_gross != null) return Number(p.total_gross);
  if (p.front_gross == null && p.back_gross == null) return null;
  return num(p.front_gross) + num(p.back_gross);
}

export function currentMmr(p: AcqPurchase): number | null {
  if (p.frozen_mmr != null) return Number(p.frozen_mmr);
  if (p.live_mmr != null) return Number(p.live_mmr);
  return null;
}

export function currentJd(p: AcqPurchase): number | null {
  if (p.frozen_jd != null) return Number(p.frozen_jd);
  if (p.live_jd != null) return Number(p.live_jd);
  return null;
}

export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysSince(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Header age: sold age for completed exits, else days since purchase. */
export function headerAgeDays(p: AcqPurchase, now = new Date()): number | null {
  if (isCompletedStage(p.stage as AcqPurchaseStage)) {
    return daysBetween(p.purchase_date, p.sold_date) ?? daysSince(p.purchase_date, now);
  }
  return daysSince(p.purchase_date, now);
}

export function websitePrice(p: AcqPurchase): number | null {
  // Inventory Command "Price" — live overlay only (not manual entry)
  if (p.live_price != null) return Number(p.live_price);
  return null;
}

export function merchCost(p: AcqPurchase): number | null {
  if (p.live_cost != null) return Number(p.live_cost);
  return null;
}

export function markup(p: AcqPurchase): number | null {
  const price = websitePrice(p);
  const cost = merchCost(p);
  if (price == null || cost == null) return null;
  return price - cost;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export function formatMoneyExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export function formatDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${formatMoneyExact(v)}`;
}
