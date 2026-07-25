/**
 * Offline verification for deal-import parse + validate (no DB).
 * Run: npx tsx lib/deal-import/verify-offline.ts
 */
import { buildTemplateCsv, DEAL_IMPORT_HEADERS } from "./csv-schema";
import { parseDealImportCsv } from "./parse";
import { validateImportRows } from "./validate";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const template = buildTemplateCsv();
const parsed = parseDealImportCsv(template);
assert(parsed.fileErrors.length === 0, `template file errors: ${parsed.fileErrors.join("; ")}`);
assert(parsed.rows.length === 1, "expected 1 example row");

const incomplete = parseDealImportCsv(
  [
    DEAL_IMPORT_HEADERS.join(","),
    // required fields intentionally blank after stock_number
    [
      "2024-01-01",
      "Smith",
      "STK1",
      "New",
      ...Array(DEAL_IMPORT_HEADERS.length - 4).fill(""),
    ].join(","),
  ].join("\n") + "\n"
);
assert(incomplete.fileErrors.length === 0, `unexpected file errors: ${incomplete.fileErrors.join("; ")}`);
assert(incomplete.rows.length === 1, "expected 1 incomplete row");
assert(incomplete.rows[0].errors.length > 0, "incomplete row must have errors");

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
