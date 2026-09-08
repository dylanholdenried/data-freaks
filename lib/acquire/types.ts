/** Acquire purchase pipeline — types and stage/source constants. */

/** Core pipeline statuses (before sold / exit). */
export const ACQ_PIPELINE_STAGES = [
  "need_to_stock_in",
  "in_transit",
  "recon",
  "frontline",
  "pending_sale",
  "wholesale",
  "arbitration",
] as const;

export const ACQ_COMPLETED_STAGES = ["sold", "arbitration_complete"] as const;

/** Active queue includes Demo (not a completed exit). */
export const ACQ_ACTIVE_STAGES = [...ACQ_PIPELINE_STAGES, "demo"] as const;

/** Display / dropdown order: pipeline → sold exits → Demo last. */
export const ACQ_STAGES = [
  ...ACQ_PIPELINE_STAGES,
  ...ACQ_COMPLETED_STAGES,
  "demo",
] as const;

export type AcqPurchaseStage = (typeof ACQ_STAGES)[number];

export const ACQ_EXIT_STAGES = ACQ_COMPLETED_STAGES;

export const ACQ_EXIT_STRATEGIES = [
  "prime",
  "subprime",
  "cash",
  "wholesale",
  "internal_transfer",
  "arbitrated",
] as const;
export type AcqExitStrategy = (typeof ACQ_EXIT_STRATEGIES)[number];

export const ACQ_SOURCE_TYPES = [
  "auction",
  "rental",
  "private",
  "dealer",
  "wholesaler",
] as const;

export type AcqSourceType = (typeof ACQ_SOURCE_TYPES)[number];

export const ACQ_STAGE_LABELS: Record<AcqPurchaseStage, string> = {
  need_to_stock_in: "Need to Stock In",
  in_transit: "In Transit",
  recon: "Recon",
  frontline: "Frontline",
  pending_sale: "Pending Sale",
  wholesale: "Wholesale",
  arbitration: "Arbitration",
  sold: "Sold",
  arbitration_complete: "Arbitration Complete",
  demo: "Demo",
};

export const ACQ_EXIT_STRATEGY_LABELS: Record<AcqExitStrategy, string> = {
  prime: "Prime",
  subprime: "Subprime",
  cash: "Cash",
  wholesale: "Wholesale",
  internal_transfer: "Internal Transfer",
  arbitrated: "Arbitrated",
};

export const ACQ_SOURCE_LABELS: Record<AcqSourceType, string> = {
  auction: "Auction",
  rental: "Rental",
  private: "Private Party",
  dealer: "Outside Dealer",
  wholesaler: "Wholesaler",
};

export const ACQ_SOURCE_COLORS: Record<
  AcqSourceType,
  { stripe: string; glow: string; badge: string }
> = {
  auction: { stripe: "#7AA7FF", glow: "#1a2740", badge: "#3d5a8a" },
  rental: { stripe: "#58B8E8", glow: "#152832", badge: "#2a5a6e" },
  private: { stripe: "#2FBF71", glow: "#15281f", badge: "#1f5a3a" },
  dealer: { stripe: "#F08C2E", glow: "#2a1f14", badge: "#6e4a1f" },
  wholesaler: { stripe: "#C084FC", glow: "#24182e", badge: "#5b3a7a" },
};

export type AcqBuyer = {
  id: string;
  dealer_group_id: string;
  name: string;
  active: boolean;
};

export type AcqPurchase = {
  id: string;
  store_id: string;
  dealer_group_id: string;
  stage: AcqPurchaseStage;
  is_incoming: boolean;
  buyer_id: string | null;
  stock_number: string | null;
  vin: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  color: string | null;
  body_style: string | null;
  drivetrain: string | null;
  odometer: number | null;
  source_type: AcqSourceType;
  auction_house: string | null;
  seller_name: string | null;
  cr_grade: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  auction_fees: number | null;
  transport_cost: number | null;
  recon_estimate: number | null;
  /** Actual recon cost */
  recon_cost: number | null;
  purchase_mmr: number | null;
  purchase_jd: number | null;
  live_matched: boolean;
  live_cost: number | null;
  live_mmr: number | null;
  live_jd: number | null;
  live_price: number | null;
  live_photo_count: number | null;
  live_synced_at: string | null;
  frozen_mmr: number | null;
  frozen_jd: number | null;
  frozen_at: string | null;
  delivery_date: string | null;
  recon_description_done: boolean;
  recon_merchandising_done: boolean;
  recon_frontline_done: boolean;
  frontline_date: string | null;
  website_price: number | null;
  sold_date: string | null;
  sold_price: number | null;
  front_gross: number | null;
  back_gross: number | null;
  total_gross: number | null;
  next_store_profit: number | null;
  exit_strategy: AcqExitStrategy | string | null;
  has_trade: boolean;
  trade_stock_number: string | null;
  trade_vin: string | null;
  trade_year: number | null;
  trade_make: string | null;
  trade_model: string | null;
  trade_acv: number | null;
  trade_allowance: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function isCompletedStage(stage: AcqPurchaseStage): boolean {
  return (ACQ_COMPLETED_STAGES as readonly string[]).includes(stage);
}

export function isExitStage(stage: AcqPurchaseStage): boolean {
  return isCompletedStage(stage);
}

export function isActiveStage(stage: AcqPurchaseStage): boolean {
  return (ACQ_ACTIVE_STAGES as readonly string[]).includes(stage);
}

export function normalizeSourceType(v: string | null | undefined): AcqSourceType {
  if (v === "other") return "wholesaler";
  if ((ACQ_SOURCE_TYPES as readonly string[]).includes(v ?? "")) {
    return v as AcqSourceType;
  }
  return "auction";
}
