/**
 * Stage-gated missing-field audit for Acquire purchase cards.
 * Counts empty manual fields that are expected at/after the current stage.
 * Inventory Command live overlays are never treated as missing.
 */

import { sellerSkipsCrGrade, type AcqPurchase, type AcqPurchaseStage } from "./types";

/** Detail tabs that can own action items (Books / Merchandising have none). */
export type AcqActionItemTab =
  | "Overview"
  | "Acquisition"
  | "Books"
  | "Recon"
  | "Merchandising"
  | "Exit";

export type AcqActionItemKey =
  | "buyer_id"
  | "stock_number"
  | "vin"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_trim"
  | "color"
  | "body_style"
  | "drivetrain"
  | "odometer"
  | "seller_name"
  | "purchase_date"
  | "cr_grade"
  | "purchase_price"
  | "auction_fees"
  | "transport_cost"
  | "recon_estimate"
  | "purchase_mmr"
  | "purchase_jd"
  | "delivery_date"
  | "recon_cost"
  | "frontline_date"
  | "recon_description_done"
  | "recon_merchandising_done"
  | "recon_frontline_done"
  | "sold_date"
  | "sold_price"
  | "exit_strategy"
  | "front_gross"
  | "back_gross"
  | "total_gross"
  | "next_store_profit"
  | "trade_stock_number"
  | "trade_vin"
  | "trade_year"
  | "trade_make"
  | "trade_model"
  | "trade_acv"
  | "trade_allowance";

export type AcqActionItem = {
  key: AcqActionItemKey;
  label: string;
  tab: AcqActionItemTab;
};

/** Pipeline rank — higher means further along. Demo sits with Frontline (on-lot). */
const STAGE_RANK: Record<AcqPurchaseStage, number> = {
  awaiting_bos: 0,
  need_to_stock_in: 1,
  in_transit: 2,
  recon: 3,
  frontline: 4,
  pending_sale: 5,
  wholesale: 5,
  arbitration: 5,
  demo: 4,
  sold: 6,
  arbitration_complete: 6,
};

function isBlank(v: string | number | null | undefined): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return !Number.isFinite(Number(v));
}

function isUnchecked(v: boolean | null | undefined): boolean {
  return !v;
}

function push(
  missing: AcqActionItem[],
  key: AcqActionItemKey,
  label: string,
  tab: AcqActionItemTab
) {
  missing.push({ key, label, tab });
}

/**
 * Returns action items still expected for this purchase's stage that are empty.
 * Order is stable for tooltips / debugging.
 */
export function missingAcquireActionItems(p: AcqPurchase): AcqActionItem[] {
  // Arbitration complete has no required fields — exit audit does not apply.
  if (p.stage === "arbitration_complete") return [];

  const rank = STAGE_RANK[p.stage] ?? 0;
  const missing: AcqActionItem[] = [];

  // ── Immediate (any stage) — vehicle + acquisition from bulk CSV ───────────
  if (isBlank(p.buyer_id)) push(missing, "buyer_id", "Buyer", "Overview");
  if (isBlank(p.stock_number)) push(missing, "stock_number", "Stock #", "Overview");
  if (isBlank(p.vin)) push(missing, "vin", "VIN", "Overview");
  if (isBlank(p.vehicle_year)) push(missing, "vehicle_year", "Year", "Overview");
  if (isBlank(p.vehicle_make)) push(missing, "vehicle_make", "Make", "Overview");
  if (isBlank(p.vehicle_model)) push(missing, "vehicle_model", "Model", "Overview");
  if (isBlank(p.vehicle_trim)) push(missing, "vehicle_trim", "Trim", "Overview");
  if (isBlank(p.color)) push(missing, "color", "Color", "Overview");
  if (isBlank(p.body_style)) push(missing, "body_style", "Body style", "Overview");
  if (isBlank(p.drivetrain)) push(missing, "drivetrain", "Drivetrain", "Overview");
  if (isBlank(p.odometer)) push(missing, "odometer", "Odometer", "Overview");
  if (isBlank(p.seller_name)) push(missing, "seller_name", "Seller", "Acquisition");
  if (isBlank(p.purchase_date)) push(missing, "purchase_date", "Purchase date", "Acquisition");
  if (isBlank(p.cr_grade) && !sellerSkipsCrGrade(p.seller_name ?? p.auction_house)) {
    push(missing, "cr_grade", "CR grade", "Acquisition");
  }
  if (isBlank(p.purchase_price)) push(missing, "purchase_price", "Purchase price", "Acquisition");
  if (isBlank(p.auction_fees)) push(missing, "auction_fees", "Auction fees", "Acquisition");
  if (isBlank(p.transport_cost)) push(missing, "transport_cost", "Transport cost", "Acquisition");
  if (isBlank(p.recon_estimate)) push(missing, "recon_estimate", "Estimate recon", "Acquisition");
  if (isBlank(p.purchase_mmr)) push(missing, "purchase_mmr", "MMR", "Acquisition");
  if (isBlank(p.purchase_jd)) push(missing, "purchase_jd", "JD Power", "Acquisition");

  // ── Recon+ ────────────────────────────────────────────────────────────────
  if (rank >= STAGE_RANK.recon) {
    if (isBlank(p.delivery_date)) push(missing, "delivery_date", "Delivery date", "Recon");
  }

  // ── Frontline+ (incl. demo / pending / wholesale / arbitration) ───────────
  if (rank >= STAGE_RANK.frontline) {
    if (isBlank(p.recon_cost)) push(missing, "recon_cost", "Actual recon cost", "Recon");
    if (isBlank(p.frontline_date)) push(missing, "frontline_date", "Frontline date", "Recon");
    if (isUnchecked(p.recon_description_done)) {
      push(missing, "recon_description_done", "Recon: description", "Recon");
    }
    if (isUnchecked(p.recon_merchandising_done)) {
      push(missing, "recon_merchandising_done", "Recon: merchandising", "Recon");
    }
    if (isUnchecked(p.recon_frontline_done)) {
      push(missing, "recon_frontline_done", "Recon: frontline", "Recon");
    }
  }

  // ── Sold / Arbitration complete only ──────────────────────────────────────
  if (rank >= STAGE_RANK.sold) {
    if (isBlank(p.sold_date)) push(missing, "sold_date", "Sold date", "Exit");
    if (isBlank(p.sold_price)) push(missing, "sold_price", "Sale price", "Exit");
    if (isBlank(p.exit_strategy)) push(missing, "exit_strategy", "Exit strategy", "Exit");
    if (isBlank(p.front_gross)) push(missing, "front_gross", "Front profit", "Exit");
    if (isBlank(p.back_gross)) push(missing, "back_gross", "Back profit", "Exit");
    if (isBlank(p.total_gross)) push(missing, "total_gross", "Total profit", "Exit");
    if (p.exit_strategy === "internal_transfer" && isBlank(p.next_store_profit)) {
      push(missing, "next_store_profit", "Next store profit", "Exit");
    }
    if (p.has_trade) {
      if (isBlank(p.trade_stock_number)) {
        push(missing, "trade_stock_number", "Trade stock", "Exit");
      }
      if (isBlank(p.trade_vin)) push(missing, "trade_vin", "Trade VIN", "Exit");
      if (isBlank(p.trade_year)) push(missing, "trade_year", "Trade year", "Exit");
      if (isBlank(p.trade_make)) push(missing, "trade_make", "Trade make", "Exit");
      if (isBlank(p.trade_model)) push(missing, "trade_model", "Trade model", "Exit");
      if (isBlank(p.trade_acv)) push(missing, "trade_acv", "Trade ACV", "Exit");
      if (isBlank(p.trade_allowance)) {
        push(missing, "trade_allowance", "Trade allowance", "Exit");
      }
    }
  }

  return missing;
}

export function countAcquireActionItems(p: AcqPurchase): number {
  return missingAcquireActionItems(p).length;
}

export function actionItemCountsByTab(
  items: AcqActionItem[]
): Record<AcqActionItemTab, number> {
  const counts: Record<AcqActionItemTab, number> = {
    Overview: 0,
    Acquisition: 0,
    Books: 0,
    Recon: 0,
    Merchandising: 0,
    Exit: 0,
  };
  for (const item of items) counts[item.tab] += 1;
  return counts;
}
