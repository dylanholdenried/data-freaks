/**
 * Offline verification for department rollup helpers.
 * Run: npx tsx lib/departments/verify-rollup.ts
 */
import {
  cardDepartmentId,
  isRolledUpDepartment,
  mapDealToCardDepartmentId,
  rollupIdsFor,
  rollupSegmentLabel,
} from "./rollup";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const chevy = {
  id: "chevy",
  name: "New Chevrolet",
  store_id: "linn",
  rolls_up_to_department_id: null,
};
const fleet = {
  id: "chevy-fleet",
  name: "Chevrolet Fleet",
  store_id: "linn",
  rolls_up_to_department_id: "chevy",
};
const used = {
  id: "po",
  name: "Pre-Owned",
  store_id: "linn",
  rolls_up_to_department_id: null,
};
const employee = {
  id: "emp",
  name: "Employee",
  store_id: "linn",
  rolls_up_to_department_id: "chevy",
};

assert(cardDepartmentId(chevy) === "chevy", "parent card id");
assert(cardDepartmentId(fleet) === "chevy", "child card id");
assert(!isRolledUpDepartment(chevy), "parent is not rolled up");
assert(isRolledUpDepartment(fleet), "child is rolled up");

const ids = rollupIdsFor("chevy", [chevy, fleet, used, employee]);
assert(ids[0] === "chevy", "parent first");
assert(ids.includes("chevy-fleet") && ids.includes("emp"), "children included");
assert(!ids.includes("po"), "unrelated dept excluded");

assert(rollupSegmentLabel(chevy) === "Retail", "parent label");
assert(rollupSegmentLabel(fleet) === "Fleet", "fleet label");
assert(rollupSegmentLabel(employee) === "Employee", "other child uses name");

assert(
  mapDealToCardDepartmentId("chevy-fleet", [chevy, fleet, used]) === "chevy",
  "deal maps to parent card"
);
assert(
  mapDealToCardDepartmentId("po", [chevy, fleet, used]) === "po",
  "unrelated deal stays on own card"
);
assert(
  mapDealToCardDepartmentId("missing", [chevy, fleet, used]) === "missing",
  "unknown dept id passthrough"
);

console.log("verify-rollup: ok");
