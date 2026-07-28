import { z } from "zod";

/** Fixed CSV headers for platform-admin deal bulk import. Case-sensitive. */
export const DEAL_IMPORT_HEADERS = [
  "sale_date",
  "customer_last_name",
  "stock_number",
  "department",
  "vehicle_year",
  "vehicle_make",
  "vehicle_model",
  "vin",
  "trim",
  "color",
  "body_style",
  "drivetrain",
  "odometer",
  "age",
  "acquisition_source",
  "finance_type",
  "finance_manager",
  "front_profit",
  "back_profit",
  "sale_price",
  "list_price",
  "salesperson_1",
  "salesperson_1_share",
  "salesperson_2",
  "salesperson_2_share",
  "has_trade",
  "trade_year",
  "trade_make",
  "trade_model",
  "trade_acv",
  "trade_allowance",
  "trade_exit_strategy",
  "notes",
] as const;

export type DealImportHeader = (typeof DEAL_IMPORT_HEADERS)[number];

export const FINANCE_TYPES = ["prime", "subprime", "cash"] as const;
export const TRADE_EXIT_STRATEGIES = ["wholesale", "retail", "auction", "other"] as const;
export const DEAL_IMPORT_STATUSES = ["pending", "closed"] as const;

const nonEmpty = z.string().trim().min(1);

const emptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()));

/** Optional integer: blank → undefined; non-blank must be an integer. */
function optionalInt(label: string) {
  return z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .superRefine((v, ctx) => {
      if (v != null && !/^-?\d+$/.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be an integer`,
        });
      }
    })
    .transform((v) => (v == null ? undefined : parseInt(v, 10)));
}

/** Optional number: blank → undefined; non-blank must be finite. */
function optionalNumber(label: string) {
  return z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .superRefine((v, ctx) => {
      if (v != null && !Number.isFinite(Number(v))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a number`,
        });
      }
    })
    .transform((v) => (v == null ? undefined : Number(v)));
}

/**
 * Accept YYYY-MM-DD, M/D/YY, M/D/YYYY (slash or dash).
 * Two-digit years: 00–69 → 2000–2069, 70–99 → 1970–1999.
 */
export function parseFlexibleSaleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else {
    const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
    if (!us) return null;
    month = parseInt(us[1], 10);
    day = parseInt(us[2], 10);
    const yRaw = parseInt(us[3], 10);
    if (us[3].length === 2) {
      year = yRaw <= 69 ? 2000 + yRaw : 1900 + yRaw;
    } else {
      year = yRaw;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const dealImportRowSchema = z
  .object({
    sale_date: nonEmpty,
    customer_last_name: emptyToUndefined,
    stock_number: nonEmpty,
    department: nonEmpty,
    vehicle_year: z
      .string()
      .trim()
      .min(1, "vehicle_year is required")
      .refine((v) => /^-?\d+$/.test(v), "vehicle_year must be an integer")
      .transform((v) => parseInt(v, 10)),
    vehicle_make: nonEmpty,
    vehicle_model: nonEmpty,
    vin: emptyToUndefined,
    trim: emptyToUndefined,
    color: emptyToUndefined,
    body_style: emptyToUndefined,
    drivetrain: emptyToUndefined,
    odometer: optionalInt("odometer"),
    age: optionalInt("age"),
    acquisition_source: emptyToUndefined,
    finance_type: emptyToUndefined,
    finance_manager: emptyToUndefined,
    front_profit: optionalNumber("front_profit"),
    back_profit: optionalNumber("back_profit"),
    sale_price: optionalNumber("sale_price"),
    list_price: emptyToUndefined,
    salesperson_1: emptyToUndefined,
    salesperson_1_share: emptyToUndefined,
    salesperson_2: emptyToUndefined,
    salesperson_2_share: emptyToUndefined,
    has_trade: emptyToUndefined,
    trade_year: emptyToUndefined,
    trade_make: emptyToUndefined,
    trade_model: emptyToUndefined,
    trade_acv: emptyToUndefined,
    trade_allowance: emptyToUndefined,
    trade_exit_strategy: emptyToUndefined,
    notes: emptyToUndefined,
  })
  .superRefine((row, ctx) => {
    if (parseFlexibleSaleDate(row.sale_date) == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sale_date must be YYYY-MM-DD, M/D/YY, or M/D/YYYY",
        path: ["sale_date"],
      });
    }

    if (row.list_price != null) {
      const listUpper = row.list_price.toUpperCase();
      if (listUpper !== "NA" && listUpper !== "N/A" && !Number.isFinite(Number(row.list_price))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "list_price must be a number or NA",
          path: ["list_price"],
        });
      }
    }

    if (row.finance_type != null) {
      const ft = row.finance_type.toLowerCase();
      if (!(FINANCE_TYPES as readonly string[]).includes(ft)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "finance_type must be prime, subprime, or cash",
          path: ["finance_type"],
        });
      }
    }

    if (row.has_trade != null) {
      const ht = row.has_trade.toLowerCase();
      if (ht !== "yes" && ht !== "no") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "has_trade must be yes or no",
          path: ["has_trade"],
        });
      }
    }

    if (row.salesperson_1_share != null && !Number.isFinite(Number(row.salesperson_1_share))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "salesperson_1_share must be a number",
        path: ["salesperson_1_share"],
      });
    }
    if (row.salesperson_2_share != null && !Number.isFinite(Number(row.salesperson_2_share))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "salesperson_2_share must be a number",
        path: ["salesperson_2_share"],
      });
    }

    const hasTradeYes = (row.has_trade ?? "").toLowerCase() === "yes";
    if (hasTradeYes) {
      if (row.trade_year != null && !/^-?\d+$/.test(row.trade_year)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_year must be an integer",
          path: ["trade_year"],
        });
      }
      if (row.trade_acv != null && !Number.isFinite(Number(row.trade_acv))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_acv must be a number",
          path: ["trade_acv"],
        });
      }
      if (row.trade_allowance != null && !Number.isFinite(Number(row.trade_allowance))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_allowance must be a number",
          path: ["trade_allowance"],
        });
      }
      if (
        row.trade_exit_strategy != null &&
        !TRADE_EXIT_STRATEGIES.includes(
          row.trade_exit_strategy.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number]
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_exit_strategy must be wholesale, retail, auction, or other",
          path: ["trade_exit_strategy"],
        });
      }
    }
  });

export type NormalizedDealImportRow = {
  status: (typeof DEAL_IMPORT_STATUSES)[number];
  sale_date: string;
  customer_last_name: string | null;
  stock_number: string;
  department: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string | null;
  trim: string | null;
  color: string | null;
  body_style: string | null;
  drivetrain: string | null;
  odometer: number | null;
  age: number | null;
  acquisition_source: string | null;
  finance_type: (typeof FINANCE_TYPES)[number] | null;
  finance_manager: string | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  salesperson_1: string | null;
  salesperson_1_share: number | null;
  salesperson_2: string | null;
  salesperson_2_share: number | null;
  has_trade: "yes" | "no";
  trade_complete: boolean;
  trade_year: number | null;
  trade_make: string | null;
  trade_model: string | null;
  trade_acv: number | null;
  trade_allowance: number | null;
  trade_exit_strategy: (typeof TRADE_EXIT_STRATEGIES)[number] | null;
  notes: string | null;
};

function isClosedComplete(
  parsed: z.infer<typeof dealImportRowSchema>,
  hasTrade: "yes" | "no",
  listPriceNa: boolean,
  listPrice: number | null
): boolean {
  const requiredStrings = [
    parsed.customer_last_name,
    parsed.vin,
    parsed.trim,
    parsed.color,
    parsed.body_style,
    parsed.drivetrain,
    parsed.acquisition_source,
    parsed.finance_type,
    parsed.finance_manager,
    parsed.salesperson_1,
  ];
  if (requiredStrings.some((v) => v == null || v === "")) return false;

  if (parsed.odometer == null || parsed.age == null) return false;
  if (parsed.front_profit == null || parsed.back_profit == null || parsed.sale_price == null) {
    return false;
  }
  if (!listPriceNa && listPrice == null) return false;

  if (parsed.salesperson_1_share == null) return false;
  const share1 = Number(parsed.salesperson_1_share);
  if (!Number.isFinite(share1)) return false;

  const hasSp2 = parsed.salesperson_2 != null || parsed.salesperson_2_share != null;
  if (hasSp2) {
    if (!parsed.salesperson_2 || parsed.salesperson_2_share == null) return false;
    const share2 = Number(parsed.salesperson_2_share);
    if (!Number.isFinite(share2)) return false;
    if (Math.abs(share1 + share2 - 100) >= 0.1) return false;
  } else if (Math.abs(share1 - 100) >= 0.1) {
    return false;
  }

  if (hasTrade === "yes") {
    if (
      !parsed.trade_year ||
      !parsed.trade_make ||
      !parsed.trade_model ||
      !parsed.trade_acv ||
      !parsed.trade_allowance ||
      !parsed.trade_exit_strategy
    ) {
      return false;
    }
    if (!/^-?\d+$/.test(parsed.trade_year)) return false;
    if (!Number.isFinite(Number(parsed.trade_acv))) return false;
    if (!Number.isFinite(Number(parsed.trade_allowance))) return false;
    if (
      !TRADE_EXIT_STRATEGIES.includes(
        parsed.trade_exit_strategy.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number]
      )
    ) {
      return false;
    }
  }

  return true;
}

export function toNormalizedDealImportRow(
  parsed: z.infer<typeof dealImportRowSchema>
): NormalizedDealImportRow {
  const saleDate = parseFlexibleSaleDate(parsed.sale_date)!;

  const listRaw = parsed.list_price;
  const listUpper = listRaw?.toUpperCase() ?? "";
  const listPriceNa = listUpper === "NA" || listUpper === "N/A";
  const listPrice =
    listRaw == null || listPriceNa ? null : Number.isFinite(Number(listRaw)) ? Number(listRaw) : null;

  const hasTradeRaw = (parsed.has_trade ?? "no").toLowerCase();
  const hasTrade: "yes" | "no" = hasTradeRaw === "yes" ? "yes" : "no";

  const tradeComplete =
    hasTrade === "yes" &&
    parsed.trade_year != null &&
    /^-?\d+$/.test(parsed.trade_year) &&
    parsed.trade_make != null &&
    parsed.trade_model != null &&
    parsed.trade_acv != null &&
    Number.isFinite(Number(parsed.trade_acv)) &&
    parsed.trade_allowance != null &&
    Number.isFinite(Number(parsed.trade_allowance)) &&
    parsed.trade_exit_strategy != null &&
    TRADE_EXIT_STRATEGIES.includes(
      parsed.trade_exit_strategy.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number]
    );

  const share2 =
    parsed.salesperson_2 != null && parsed.salesperson_2_share != null
      ? Number(parsed.salesperson_2_share)
      : null;

  const status: "pending" | "closed" = isClosedComplete(
    parsed,
    hasTrade,
    listPriceNa,
    listPrice
  )
    ? "closed"
    : "pending";

  return {
    status,
    sale_date: saleDate,
    customer_last_name: parsed.customer_last_name ?? null,
    stock_number: parsed.stock_number,
    department: parsed.department,
    vehicle_year: parsed.vehicle_year,
    vehicle_make: parsed.vehicle_make,
    vehicle_model: parsed.vehicle_model,
    vin: parsed.vin ?? null,
    trim: parsed.trim ?? null,
    color: parsed.color ?? null,
    body_style: parsed.body_style ?? null,
    drivetrain: parsed.drivetrain ?? null,
    odometer: parsed.odometer ?? null,
    age: parsed.age ?? null,
    acquisition_source: parsed.acquisition_source ?? null,
    finance_type: parsed.finance_type
      ? (parsed.finance_type.toLowerCase() as (typeof FINANCE_TYPES)[number])
      : null,
    finance_manager: parsed.finance_manager ?? null,
    front_profit: parsed.front_profit ?? null,
    back_profit: parsed.back_profit ?? null,
    sale_price: parsed.sale_price ?? null,
    list_price: listPrice,
    list_price_na: listPriceNa,
    salesperson_1: parsed.salesperson_1 ?? null,
    salesperson_1_share:
      parsed.salesperson_1_share != null ? Number(parsed.salesperson_1_share) : null,
    salesperson_2: parsed.salesperson_2 ?? null,
    salesperson_2_share: share2 != null && Number.isFinite(share2) ? share2 : null,
    has_trade: hasTrade,
    trade_complete: tradeComplete,
    trade_year:
      hasTrade === "yes" && parsed.trade_year && /^-?\d+$/.test(parsed.trade_year)
        ? parseInt(parsed.trade_year, 10)
        : null,
    trade_make: hasTrade === "yes" ? (parsed.trade_make ?? null) : null,
    trade_model: hasTrade === "yes" ? (parsed.trade_model ?? null) : null,
    trade_acv:
      hasTrade === "yes" && parsed.trade_acv != null && Number.isFinite(Number(parsed.trade_acv))
        ? Number(parsed.trade_acv)
        : null,
    trade_allowance:
      hasTrade === "yes" &&
      parsed.trade_allowance != null &&
      Number.isFinite(Number(parsed.trade_allowance))
        ? Number(parsed.trade_allowance)
        : null,
    trade_exit_strategy:
      hasTrade === "yes" &&
      parsed.trade_exit_strategy &&
      TRADE_EXIT_STRATEGIES.includes(
        parsed.trade_exit_strategy.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number]
      )
        ? (parsed.trade_exit_strategy.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number])
        : null,
    notes: parsed.notes ?? null,
  };
}

/** Example row for the downloadable template (illustrative only). */
export const DEAL_IMPORT_EXAMPLE_ROW: Record<DealImportHeader, string> = {
  sale_date: "2024-06-15",
  customer_last_name: "Smith",
  stock_number: "STK-1001",
  department: "New",
  vehicle_year: "2024",
  vehicle_make: "Toyota",
  vehicle_model: "Camry",
  vin: "4T1BF1FK5EU123456",
  trim: "SE",
  color: "White",
  body_style: "Sedan",
  drivetrain: "FWD",
  odometer: "12",
  age: "5",
  acquisition_source: "Auction",
  finance_type: "prime",
  finance_manager: "Jane Doe",
  front_profit: "1200.00",
  back_profit: "800.00",
  sale_price: "28500.00",
  list_price: "29900.00",
  salesperson_1: "John Sales",
  salesperson_1_share: "100",
  salesperson_2: "",
  salesperson_2_share: "",
  has_trade: "no",
  trade_year: "",
  trade_make: "",
  trade_model: "",
  trade_acv: "",
  trade_allowance: "",
  trade_exit_strategy: "",
  notes: "",
};

export function buildTemplateCsv(): string {
  const header = DEAL_IMPORT_HEADERS.join(",");
  const example = DEAL_IMPORT_HEADERS.map((h) => {
    const v = DEAL_IMPORT_EXAMPLE_ROW[h];
    return v.includes(",") ? `"${v}"` : v;
  }).join(",");
  return `${header}\n${example}\n`;
}
