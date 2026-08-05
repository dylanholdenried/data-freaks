/**
 * Offline verification for deal-import parse + validate (no DB).
 * Run: npx tsx lib/deal-import/verify-offline.ts
 */
import {
  buildTemplateCsv,
  DEAL_IMPORT_EXAMPLE_ROW,
  DEAL_IMPORT_HEADERS,
  type DealImportHeader,
  parseFlexibleSaleDate,
} from "./csv-schema";
import { parseDealImportCsv } from "./parse";
import { validateImportRows } from "./validate";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseFlexibleSaleDate("2024-06-15") === "2024-06-15", "ISO date");
assert(parseFlexibleSaleDate("8/1/25") === "2025-08-01", "M/D/YY");
assert(parseFlexibleSaleDate("8/1/2025") === "2025-08-01", "M/D/YYYY");
assert(parseFlexibleSaleDate("08-01-25") === "2025-08-01", "M-D-YY");
assert(parseFlexibleSaleDate("2/30/25") == null, "invalid calendar date");
assert(parseFlexibleSaleDate("not-a-date") == null, "garbage date");

const template = buildTemplateCsv();
const parsed = parseDealImportCsv(template);
assert(parsed.fileErrors.length === 0, `template file errors: ${parsed.fileErrors.join("; ")}`);
assert(parsed.rows.length === 1, "expected 1 example row");
assert(parsed.rows[0].errors.length === 0, `template row errors: ${parsed.rows[0].errors.join("; ")}`);
assert(parsed.rows[0].normalized?.status === "closed", "full template row should be closed");
assert(parsed.rows[0].normalized?.msrp === 32000, "template example msrp normalized");

const upperMsrpCsv = buildTemplateCsv().replace(/,msrp\n/, ",MSRP\n");
const upperMsrpParsed = parseDealImportCsv(upperMsrpCsv);
assert(
  upperMsrpParsed.fileErrors.length === 0,
  `MSRP header should be accepted case-insensitively: ${upperMsrpParsed.fileErrors.join("; ")}`
);
assert(upperMsrpParsed.rows[0]?.normalized?.msrp === 32000, "uppercase MSRP column maps to msrp");

const incomplete = parseDealImportCsv(
  [
    DEAL_IMPORT_HEADERS.join(","),
    // minimum identity + blanks elsewhere (US date, blank last name / VIN / body_style)
    [
      "8/1/25",
      "",
      "STK1",
      "New",
      "2020",
      "Toyota",
      "Camry",
      ...Array(DEAL_IMPORT_HEADERS.length - 7).fill(""),
    ].join(","),
  ].join("\n") + "\n"
);
assert(incomplete.fileErrors.length === 0, `unexpected file errors: ${incomplete.fileErrors.join("; ")}`);
assert(incomplete.rows.length === 1, "expected 1 incomplete row");
assert(
  incomplete.rows[0].errors.length === 0,
  `incomplete blanks should parse: ${incomplete.rows[0].errors.join("; ")}`
);
assert(incomplete.rows[0].normalized?.status === "pending", "blank fields → pending");
assert(incomplete.rows[0].normalized?.sale_date === "2025-08-01", "flexible date normalized");
assert(incomplete.rows[0].normalized?.customer_last_name == null, "blank last name → null");
assert(incomplete.rows[0].normalized?.vin == null, "blank vin → null");
assert(incomplete.rows[0].normalized?.msrp == null, "blank msrp on incomplete → null");

/** Build a CSV from the example row with selected fields blanked. */
function csvWithBlanks(blankHeaders: DealImportHeader[]): string {
  const row = { ...DEAL_IMPORT_EXAMPLE_ROW };
  for (const h of blankHeaders) row[h] = "";
  const body = DEAL_IMPORT_HEADERS.map((h) => {
    const v = row[h];
    return v.includes(",") ? `"${v}"` : v;
  }).join(",");
  return `${DEAL_IMPORT_HEADERS.join(",")}\n${body}\n`;
}

const closedNoColorListExit = parseDealImportCsv(
  csvWithBlanks(["color", "list_price", "trade_exit_strategy", "msrp"])
);
assert(
  closedNoColorListExit.rows[0].errors.length === 0,
  `closed-optional blanks should parse: ${closedNoColorListExit.rows[0].errors.join("; ")}`
);
assert(
  closedNoColorListExit.rows[0].normalized?.status === "closed",
  "blank color + list_price + trade_exit_strategy + msrp (no trade) → still closed"
);
assert(closedNoColorListExit.rows[0].normalized?.color == null, "blank color → null");
assert(closedNoColorListExit.rows[0].normalized?.list_price == null, "blank list_price → null");
assert(closedNoColorListExit.rows[0].normalized?.msrp == null, "blank msrp → null");
assert(
  closedNoColorListExit.rows[0].normalized?.list_price_na === false,
  "blank list_price is not NA"
);

const closedNoFront = parseDealImportCsv(csvWithBlanks(["front_profit"]));
assert(
  closedNoFront.rows[0].errors.length === 0,
  `blank front_profit should parse: ${closedNoFront.rows[0].errors.join("; ")}`
);
assert(
  closedNoFront.rows[0].normalized?.status === "closed",
  "blank front_profit with back + other closed fields → still closed"
);
assert(closedNoFront.rows[0].normalized?.front_profit == null, "blank front_profit → null");
assert(
  closedNoFront.rows[0].normalized?.back_profit === 800,
  "back_profit still present when front blank"
);

const tradeRow = { ...DEAL_IMPORT_EXAMPLE_ROW };
tradeRow.color = "";
tradeRow.list_price = "";
tradeRow.has_trade = "yes";
tradeRow.trade_year = "2018";
tradeRow.trade_make = "Honda";
tradeRow.trade_model = "Civic";
tradeRow.trade_acv = "5000";
tradeRow.trade_allowance = "4000";
tradeRow.trade_exit_strategy = "";
const tradeCsv = `${DEAL_IMPORT_HEADERS.join(",")}\n${DEAL_IMPORT_HEADERS.map((h) => {
  const v = tradeRow[h];
  return v.includes(",") ? `"${v}"` : v;
}).join(",")}\n`;
const closedTradeNoExitParsed = parseDealImportCsv(tradeCsv);
assert(
  closedTradeNoExitParsed.rows[0].errors.length === 0,
  `trade without exit should parse: ${closedTradeNoExitParsed.rows[0].errors.join("; ")}`
);
assert(
  closedTradeNoExitParsed.rows[0].normalized?.status === "closed",
  "has_trade=yes without trade_exit_strategy → still closed"
);
assert(
  closedTradeNoExitParsed.rows[0].normalized?.trade_complete === true,
  "trade without exit_strategy is still complete enough to insert"
);
assert(
  closedTradeNoExitParsed.rows[0].normalized?.trade_exit_strategy == null,
  "blank trade_exit_strategy → null"
);

const badDate = parseDealImportCsv(
  [
    DEAL_IMPORT_HEADERS.join(","),
    [
      "not-a-date",
      "Smith",
      "STK2",
      "New",
      "2020",
      "Toyota",
      "Camry",
      ...Array(DEAL_IMPORT_HEADERS.length - 7).fill(""),
    ].join(","),
  ].join("\n") + "\n"
);
assert(badDate.rows[0].errors.length > 0, "bad date must have errors");
assert(
  badDate.rows[0].errors.some((e) => e.includes("sale_date")),
  "sale_date error expected"
);

const missingStock = parseDealImportCsv(
  [
    DEAL_IMPORT_HEADERS.join(","),
    [
      "2024-01-01",
      "Smith",
      "",
      "New",
      "2020",
      "Toyota",
      "Camry",
      ...Array(DEAL_IMPORT_HEADERS.length - 7).fill(""),
    ].join(","),
  ].join("\n") + "\n"
);
assert(missingStock.rows[0].errors.length > 0, "missing stock_number must fail");

const goodCsv = buildTemplateCsv();
const goodParsed = parseDealImportCsv(goodCsv);
const validated = validateImportRows(goodParsed.rows, {
  departments: [{ id: "d1", name: "New" }],
  salespeople: [{ id: "s1", name: "John Sales" }],
  financeManagers: [{ id: "f1", name: "Jane Doe" }],
  acquisitionSources: [{ id: "a1", name: "Auction" }],
  departmentMakes: [],
  existingStockNumbers: new Set(),
});
assert(validated[0].is_valid, `expected valid: ${validated[0].errors.join("; ")}`);

const incompleteValidated = validateImportRows(incomplete.rows, {
  departments: [{ id: "d1", name: "New" }],
  salespeople: [],
  financeManagers: [],
  acquisitionSources: [],
  departmentMakes: [],
  existingStockNumbers: new Set(),
});
assert(
  incompleteValidated[0].is_valid,
  `incomplete pending row should validate: ${incompleteValidated[0].errors.join("; ")}`
);
assert(
  incompleteValidated[0].warnings.some((w) => w.includes("pending")),
  "pending warning expected"
);

const wrongDept = validateImportRows(goodParsed.rows, {
  departments: [{ id: "d1", name: "Used" }],
  salespeople: [{ id: "s1", name: "John Sales" }],
  financeManagers: [{ id: "f1", name: "Jane Doe" }],
  acquisitionSources: [{ id: "a1", name: "Auction" }],
  departmentMakes: [],
  existingStockNumbers: new Set(),
});
assert(!wrongDept[0].is_valid, "unknown department must fail");
assert(
  wrongDept[0].errors.some((e) => e.includes("department")),
  "department error expected"
);

const dupStock = validateImportRows(goodParsed.rows, {
  departments: [{ id: "d1", name: "New" }],
  salespeople: [{ id: "s1", name: "John Sales" }],
  financeManagers: [{ id: "f1", name: "Jane Doe" }],
  acquisitionSources: [{ id: "a1", name: "Auction" }],
  departmentMakes: [],
  existingStockNumbers: new Set(["stk-1001"]),
});
assert(!dupStock[0].is_valid, "existing stock must fail");

const badMsrp = parseDealImportCsv(
  csvWithBlanks([]).replace(/32000\.00/, "not-a-number")
);
assert(badMsrp.rows[0].errors.length > 0, "non-numeric msrp must fail");
assert(
  badMsrp.rows[0].errors.some((e) => e.toLowerCase().includes("msrp")),
  "msrp error expected"
);

console.log("deal-import offline verify: OK");
