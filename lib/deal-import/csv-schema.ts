import { z } from "zod";

/** Fixed CSV headers for platform-admin closed-deal bulk import. Case-sensitive. */
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

const nonEmpty = z.string().trim().min(1);

function requiredNumber(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => Number.isFinite(Number(v)), `${label} must be a number`)
    .transform((v) => Number(v));
}

function requiredInt(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => /^-?\d+$/.test(v), `${label} must be an integer`)
    .transform((v) => parseInt(v, 10));
}

const emptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()));

export const dealImportRowSchema = z
  .object({
    sale_date: nonEmpty.regex(/^\d{4}-\d{2}-\d{2}$/, "sale_date must be YYYY-MM-DD"),
    customer_last_name: nonEmpty,
    stock_number: nonEmpty,
    department: nonEmpty,
    vehicle_year: requiredInt("vehicle_year"),
    vehicle_make: nonEmpty,
    vehicle_model: nonEmpty,
    vin: nonEmpty,
    trim: nonEmpty,
    color: nonEmpty,
    body_style: nonEmpty,
    drivetrain: nonEmpty,
    odometer: requiredInt("odometer"),
    age: requiredInt("age"),
    acquisition_source: nonEmpty,
    finance_type: nonEmpty.transform((v) => v.toLowerCase()).pipe(
      z.enum(FINANCE_TYPES, {
        errorMap: () => ({ message: "finance_type must be prime, subprime, or cash" }),
      })
    ),
    finance_manager: nonEmpty,
    front_profit: requiredNumber("front_profit"),
    back_profit: requiredNumber("back_profit"),
    sale_price: requiredNumber("sale_price"),
    salesperson_1: nonEmpty,
    salesperson_1_share: requiredNumber("salesperson_1_share"),
    salesperson_2: emptyToUndefined,
    salesperson_2_share: emptyToUndefined,
    has_trade: nonEmpty.transform((v) => v.toLowerCase()).pipe(
      z.enum(["yes", "no"], {
        errorMap: () => ({ message: "has_trade must be yes or no" }),
      })
    ),
    trade_year: emptyToUndefined,
    trade_make: emptyToUndefined,
    trade_model: emptyToUndefined,
    trade_acv: emptyToUndefined,
    trade_allowance: emptyToUndefined,
    trade_exit_strategy: emptyToUndefined,
    notes: emptyToUndefined,
  })
  .superRefine((row, ctx) => {
    const share1 = row.salesperson_1_share;
    const hasSp2 = row.salesperson_2 != null || row.salesperson_2_share != null;
    if (hasSp2) {
      if (!row.salesperson_2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "salesperson_2 is required when salesperson_2_share is set",
          path: ["salesperson_2"],
        });
      }
      if (row.salesperson_2_share == null || row.salesperson_2_share === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "salesperson_2_share is required when salesperson_2 is set",
          path: ["salesperson_2_share"],
        });
      }
    }

    const share2 =
      row.salesperson_2_share != null && row.salesperson_2_share !== ""
        ? Number(row.salesperson_2_share)
        : 0;
    if (hasSp2 && !Number.isFinite(share2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "salesperson_2_share must be a number",
        path: ["salesperson_2_share"],
      });
    }
    const total = share1 + (Number.isFinite(share2) ? share2 : 0);
    if (Math.abs(total - 100) >= 0.1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Salesperson splits must total 100% (currently ${Math.round(total)}%)`,
        path: ["salesperson_1_share"],
      });
    }

    if (row.has_trade === "yes") {
      const tradeFields: Array<[keyof typeof row, string]> = [
        ["trade_year", "trade_year"],
        ["trade_make", "trade_make"],
        ["trade_model", "trade_model"],
        ["trade_acv", "trade_acv"],
        ["trade_allowance", "trade_allowance"],
        ["trade_exit_strategy", "trade_exit_strategy"],
      ];
      for (const [key, label] of tradeFields) {
        if (row[key] == null || String(row[key]).trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${label} is required when has_trade=yes`,
            path: [key],
          });
        }
      }
      if (row.trade_year && !/^-?\d+$/.test(row.trade_year)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_year must be an integer",
          path: ["trade_year"],
        });
      }
      if (row.trade_acv && !Number.isFinite(Number(row.trade_acv))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_acv must be a number",
          path: ["trade_acv"],
        });
      }
      if (row.trade_allowance && !Number.isFinite(Number(row.trade_allowance))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "trade_allowance must be a number",
          path: ["trade_allowance"],
        });
      }
      if (
        row.trade_exit_strategy &&
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
    } else {
      const tradeFields = [
        "trade_year",
        "trade_make",
        "trade_model",
        "trade_acv",
        "trade_allowance",
        "trade_exit_strategy",
      ] as const;
      for (const key of tradeFields) {
        if (row[key] != null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} must be empty when has_trade=no`,
            path: [key],
          });
        }
      }
    }
  });

export type NormalizedDealImportRow = {
  sale_date: string;
  customer_last_name: string;
  stock_number: string;
  department: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string;
  trim: string;
  color: string;
  body_style: string;
  drivetrain: string;
  odometer: number;
  age: number;
  acquisition_source: string;
  finance_type: (typeof FINANCE_TYPES)[number];
  finance_manager: string;
  front_profit: number;
  back_profit: number;
  sale_price: number;
  salesperson_1: string;
  salesperson_1_share: number;
  salesperson_2: string | null;
  salesperson_2_share: number | null;
  has_trade: "yes" | "no";
  trade_year: number | null;
  trade_make: string | null;
  trade_model: string | null;
  trade_acv: number | null;
  trade_allowance: number | null;
  trade_exit_strategy: (typeof TRADE_EXIT_STRATEGIES)[number] | null;
  notes: string | null;
};

export function toNormalizedDealImportRow(
  parsed: z.infer<typeof dealImportRowSchema>
): NormalizedDealImportRow {
  const share2 =
    parsed.salesperson_2 != null && parsed.salesperson_2_share != null
      ? Number(parsed.salesperson_2_share)
      : null;

  return {
    sale_date: parsed.sale_date,
    customer_last_name: parsed.customer_last_name,
    stock_number: parsed.stock_number,
    department: parsed.department,
    vehicle_year: parsed.vehicle_year,
    vehicle_make: parsed.vehicle_make,
    vehicle_model: parsed.vehicle_model,
    vin: parsed.vin,
    trim: parsed.trim,
    color: parsed.color,
    body_style: parsed.body_style,
    drivetrain: parsed.drivetrain,
    odometer: parsed.odometer,
    age: parsed.age,
    acquisition_source: parsed.acquisition_source,
    finance_type: parsed.finance_type,
    finance_manager: parsed.finance_manager,
    front_profit: parsed.front_profit,
    back_profit: parsed.back_profit,
    sale_price: parsed.sale_price,
    salesperson_1: parsed.salesperson_1,
    salesperson_1_share: parsed.salesperson_1_share,
    salesperson_2: parsed.salesperson_2 ?? null,
    salesperson_2_share: share2,
    has_trade: parsed.has_trade,
    trade_year: parsed.has_trade === "yes" ? parseInt(parsed.trade_year!, 10) : null,
    trade_make: parsed.has_trade === "yes" ? parsed.trade_make! : null,
    trade_model: parsed.has_trade === "yes" ? parsed.trade_model! : null,
    trade_acv: parsed.has_trade === "yes" ? Number(parsed.trade_acv) : null,
    trade_allowance: parsed.has_trade === "yes" ? Number(parsed.trade_allowance) : null,
    trade_exit_strategy:
      parsed.has_trade === "yes"
        ? (parsed.trade_exit_strategy!.toLowerCase() as (typeof TRADE_EXIT_STRATEGIES)[number])
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
