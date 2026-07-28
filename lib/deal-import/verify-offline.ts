/**
 * Offline verification for deal-import parse + validate (no DB).
 * Run: npx tsx lib/deal-import/verify-offline.ts
 */
import {
  buildTemplateCsv,
  DEAL_IMPORT_HEADERS,
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

console.log("deal-import offline verify: OK");
