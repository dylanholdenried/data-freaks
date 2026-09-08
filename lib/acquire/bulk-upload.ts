/**
 * Acquire bulk purchase CSV — template headers, parse, and row → insert mapping.
 * Blanks are allowed; only dealership is required per row.
 */

import Papa from "papaparse";
import {
  ACQ_EXIT_STRATEGIES,
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_LABELS,
  ACQ_SOURCE_TYPES,
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  normalizeSourceType,
  type AcqExitStrategy,
  type AcqPurchaseStage,
  type AcqSourceType,
} from "./types";

/** Column order for the downloadable template (manual card fields only). */
export const ACQ_BULK_HEADERS = [
  "dealership",
  "status",
  "buyer",
  "stock_number",
  "vin",
  "vehicle_year",
  "vehicle_make",
  "vehicle_model",
  "vehicle_trim",
  "color",
  "body_style",
  "drivetrain",
  "odometer",
  "source_type",
  "seller_name",
  "purchase_date",
  "cr_grade",
  "purchase_price",
  "auction_fees",
  "transport_cost",
  "recon_estimate",
  "purchase_mmr",
  "purchase_jd",
  "delivery_date",
  "frontline_date",
  "recon_cost",
  "recon_description_done",
  "recon_merchandising_done",
  "recon_frontline_done",
  "sold_date",
  "sold_price",
  "exit_strategy",
  "front_gross",
  "back_gross",
  "total_gross",
  "next_store_profit",
  "has_trade",
  "trade_stock_number",
  "trade_vin",
  "trade_year",
  "trade_make",
  "trade_model",
  "trade_acv",
  "trade_allowance",
] as const;

export type AcqBulkHeader = (typeof ACQ_BULK_HEADERS)[number];

export const ACQ_BULK_TEMPLATE_FILENAME = "acquire-purchases-template.csv";

export function buildAcquirePurchasesCsvTemplate(): string {
  return ACQ_BULK_HEADERS.join(",") + "\n";
}

export type AcqBulkParsedRow = {
  rowNumber: number; // 1-based data row (header is row 1)
  dealership: string;
  status: AcqPurchaseStage;
  buyerName: string | null;
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
  seller_name: string | null;
  purchase_date: string | null;
  cr_grade: string | null;
  purchase_price: number | null;
  auction_fees: number | null;
  transport_cost: number | null;
  recon_estimate: number | null;
  purchase_mmr: number | null;
  purchase_jd: number | null;
  delivery_date: string | null;
  frontline_date: string | null;
  recon_cost: number | null;
  recon_description_done: boolean;
  recon_merchandising_done: boolean;
  recon_frontline_done: boolean;
  sold_date: string | null;
  sold_price: number | null;
  exit_strategy: AcqExitStrategy | null;
  front_gross: number | null;
  back_gross: number | null;
  total_gross: number | null;
  next_store_profit: number | null;
  has_trade: boolean;
  trade_stock_number: string | null;
  trade_vin: string | null;
  trade_year: number | null;
  trade_make: string | null;
  trade_model: string | null;
  trade_acv: number | null;
  trade_allowance: number | null;
};

export type AcqBulkParseResult =
  | { ok: true; rows: AcqBulkParsedRow[]; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

function cell(row: Record<string, string>, key: AcqBulkHeader): string {
  const raw = row[key] ?? row[key.toLowerCase()] ?? "";
  return String(raw).trim();
}

function toStr(v: string): string | null {
  return v ? v : null;
}

function toNum(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toInt(v: string): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

function toBool(v: string): boolean {
  const s = v.toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "on";
}

function toDate(v: string): string | null {
  if (!v) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // M/D/YYYY or MM/DD/YYYY
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) {
    const mm = m[1]!.padStart(2, "0");
    const dd = m[2]!.padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const t = Date.parse(v);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function parseStage(v: string): AcqPurchaseStage {
  if (!v) return "need_to_stock_in";
  const lower = v.toLowerCase().replace(/\s+/g, "_");
  if ((ACQ_STAGES as readonly string[]).includes(lower)) {
    return lower as AcqPurchaseStage;
  }
  for (const stage of ACQ_STAGES) {
    if (ACQ_STAGE_LABELS[stage].toLowerCase() === v.toLowerCase()) return stage;
  }
  return "need_to_stock_in";
}

function parseSource(v: string): AcqSourceType {
  if (!v) return "auction";
  const lower = v.toLowerCase().replace(/\s+/g, "_");
  if (lower === "private_party") return "private";
  if (lower === "outside_dealer") return "dealer";
  for (const s of ACQ_SOURCE_TYPES) {
    if (ACQ_SOURCE_LABELS[s].toLowerCase() === v.toLowerCase()) return s;
  }
  return normalizeSourceType(lower);
}

function parseExit(v: string): AcqExitStrategy | null {
  if (!v) return null;
  if (v === "retail") return "prime";
  if (v === "wholesale_sold") return "wholesale";
  const lower = v.toLowerCase().replace(/\s+/g, "_");
  if ((ACQ_EXIT_STRATEGIES as readonly string[]).includes(lower)) {
    return lower as AcqExitStrategy;
  }
  for (const s of ACQ_EXIT_STRATEGIES) {
    if (ACQ_EXIT_STRATEGY_LABELS[s].toLowerCase() === v.toLowerCase()) return s;
  }
  return null;
}

function normalizeHeaderKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/\s+/g, "_");
}

/** Alias headers users might type */
const HEADER_ALIASES: Record<string, AcqBulkHeader> = {
  dealership: "dealership",
  store: "dealership",
  store_name: "dealership",
  status: "status",
  stage: "status",
  buyer: "buyer",
  buyer_name: "buyer",
  stock: "stock_number",
  stock_number: "stock_number",
  stock_num: "stock_number",
  vin: "vin",
  year: "vehicle_year",
  vehicle_year: "vehicle_year",
  make: "vehicle_make",
  vehicle_make: "vehicle_make",
  model: "vehicle_model",
  vehicle_model: "vehicle_model",
  trim: "vehicle_trim",
  vehicle_trim: "vehicle_trim",
  color: "color",
  body_style: "body_style",
  body: "body_style",
  drivetrain: "drivetrain",
  drive: "drivetrain",
  odometer: "odometer",
  miles: "odometer",
  source: "source_type",
  source_type: "source_type",
  purchase_source: "source_type",
  seller_name: "seller_name",
  auction_house: "seller_name",
  seller: "seller_name",
  purchase_date: "purchase_date",
  cr_grade: "cr_grade",
  purchase_price: "purchase_price",
  auction_fees: "auction_fees",
  transport_cost: "transport_cost",
  recon_estimate: "recon_estimate",
  estimate_recon: "recon_estimate",
  purchase_mmr: "purchase_mmr",
  mmr: "purchase_mmr",
  purchase_jd: "purchase_jd",
  jd: "purchase_jd",
  jd_power_clean_trade: "purchase_jd",
  delivery_date: "delivery_date",
  frontline_date: "frontline_date",
  recon_cost: "recon_cost",
  actual_reconditioning_cost: "recon_cost",
  recon_description_done: "recon_description_done",
  recon_merchandising_done: "recon_merchandising_done",
  recon_frontline_done: "recon_frontline_done",
  sold_date: "sold_date",
  sold_price: "sold_price",
  exit_strategy: "exit_strategy",
  front_gross: "front_gross",
  front_profit: "front_gross",
  back_gross: "back_gross",
  back_profit: "back_gross",
  total_gross: "total_gross",
  total_profit: "total_gross",
  next_store_profit: "next_store_profit",
  has_trade: "has_trade",
  trade_stock_number: "trade_stock_number",
  trade_vin: "trade_vin",
  trade_year: "trade_year",
  trade_make: "trade_make",
  trade_model: "trade_model",
  trade_acv: "trade_acv",
  trade_allowance: "trade_allowance",
};

export function parseAcquirePurchasesCsv(text: string): AcqBulkParseResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => {
      const key = normalizeHeaderKey(h);
      return HEADER_ALIASES[key] ?? key;
    },
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    return {
      ok: false,
      error: first?.message ?? "CSV parse failed",
      warnings,
    };
  }

  const data = parsed.data ?? [];
  if (!data.length) {
    return { ok: false, error: "CSV has no data rows.", warnings };
  }

  const headers = (parsed.meta.fields ?? []).map((h) => normalizeHeaderKey(h));
  if (!headers.includes("dealership")) {
    return {
      ok: false,
      error: 'Missing required column "dealership". Download the template for the correct headers.',
      warnings,
    };
  }

  const rows: AcqBulkParsedRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const raw = data[i]!;
    const dealership = cell(raw, "dealership");
    // Skip completely empty rows
    const anyValue = ACQ_BULK_HEADERS.some((h) => cell(raw, h));
    if (!anyValue) continue;
    if (!dealership) {
      warnings.push(`Row ${i + 2}: skipped — dealership is blank.`);
      continue;
    }

    const purchaseDateRaw = cell(raw, "purchase_date");
    const purchaseDate = toDate(purchaseDateRaw);
    if (purchaseDateRaw && !purchaseDate) {
      warnings.push(`Row ${i + 2}: could not parse purchase_date "${purchaseDateRaw}".`);
    }

    rows.push({
      rowNumber: i + 2,
      dealership,
      status: parseStage(cell(raw, "status")),
      buyerName: toStr(cell(raw, "buyer")),
      stock_number: toStr(cell(raw, "stock_number")),
      vin: toStr(cell(raw, "vin"))?.toUpperCase() ?? null,
      vehicle_year: toInt(cell(raw, "vehicle_year")),
      vehicle_make: toStr(cell(raw, "vehicle_make")),
      vehicle_model: toStr(cell(raw, "vehicle_model")),
      vehicle_trim: toStr(cell(raw, "vehicle_trim")),
      color: toStr(cell(raw, "color")),
      body_style: toStr(cell(raw, "body_style")),
      drivetrain: toStr(cell(raw, "drivetrain")),
      odometer: toInt(cell(raw, "odometer")),
      source_type: parseSource(cell(raw, "source_type")),
      seller_name: toStr(cell(raw, "seller_name")),
      purchase_date: purchaseDate,
      cr_grade: toStr(cell(raw, "cr_grade")),
      purchase_price: toNum(cell(raw, "purchase_price")),
      auction_fees: toNum(cell(raw, "auction_fees")),
      transport_cost: toNum(cell(raw, "transport_cost")),
      recon_estimate: toNum(cell(raw, "recon_estimate")),
      purchase_mmr: toNum(cell(raw, "purchase_mmr")),
      purchase_jd: toNum(cell(raw, "purchase_jd")),
      delivery_date: toDate(cell(raw, "delivery_date")),
      frontline_date: toDate(cell(raw, "frontline_date")),
      recon_cost: toNum(cell(raw, "recon_cost")),
      recon_description_done: toBool(cell(raw, "recon_description_done")),
      recon_merchandising_done: toBool(cell(raw, "recon_merchandising_done")),
      recon_frontline_done: toBool(cell(raw, "recon_frontline_done")),
      sold_date: toDate(cell(raw, "sold_date")),
      sold_price: toNum(cell(raw, "sold_price")),
      exit_strategy: parseExit(cell(raw, "exit_strategy")),
      front_gross: toNum(cell(raw, "front_gross")),
      back_gross: toNum(cell(raw, "back_gross")),
      total_gross: toNum(cell(raw, "total_gross")),
      next_store_profit: toNum(cell(raw, "next_store_profit")),
      has_trade: toBool(cell(raw, "has_trade")),
      trade_stock_number: toStr(cell(raw, "trade_stock_number")),
      trade_vin: toStr(cell(raw, "trade_vin"))?.toUpperCase() ?? null,
      trade_year: toInt(cell(raw, "trade_year")),
      trade_make: toStr(cell(raw, "trade_make")),
      trade_model: toStr(cell(raw, "trade_model")),
      trade_acv: toNum(cell(raw, "trade_acv")),
      trade_allowance: toNum(cell(raw, "trade_allowance")),
    });
  }

  if (!rows.length) {
    return { ok: false, error: "No valid purchase rows found (need dealership on each row).", warnings };
  }

  return { ok: true, rows, warnings };
}

export function matchStoreId(
  dealership: string,
  stores: { id: string; name: string }[]
): string | null {
  const needle = dealership.trim().toLowerCase();
  if (!needle) return null;
  const exact = stores.find((s) => s.name.trim().toLowerCase() === needle);
  if (exact) return exact.id;
  // Last-word match (e.g. "Fenton" → "Jim Butler Fenton")
  const byLast = stores.filter((s) => {
    const parts = s.name.trim().split(/\s+/);
    return (parts[parts.length - 1] ?? "").toLowerCase() === needle;
  });
  if (byLast.length === 1) return byLast[0]!.id;
  // Contains
  const contains = stores.filter((s) => s.name.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0]!.id;
  return null;
}

export function matchBuyerId(
  buyerName: string | null,
  buyers: { id: string; name: string; active: boolean }[]
): string | null {
  if (!buyerName) return null;
  const needle = buyerName.trim().toLowerCase();
  const exact = buyers.find((b) => b.name.trim().toLowerCase() === needle);
  return exact?.id ?? null;
}
