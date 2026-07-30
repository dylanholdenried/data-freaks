import { SUBPRIME } from "./config";
import type { InvUnitRow } from "./types";

export type SubprimeAuditReason =
  | "owned_over_book"
  | "thin_spread"
  | "no_jd"
  | "aged_30_plus";

export type SubprimeAuditRow = InvUnitRow & {
  reasons: SubprimeAuditReason[];
  jd115: number | null;
  jd115MinusCost: number | null;
  spread: number | null;
};

function jd115(jd: number | null): number | null {
  if (jd == null) return null;
  return Math.round(jd * SUBPRIME.targetRetailJdMult);
}

export function auditSubprimeUnit(u: InvUnitRow): SubprimeAuditReason[] {
  const reasons: SubprimeAuditReason[] = [];
  const cost = u.cost;
  const jd = u.jd;
  const age = u.age ?? 0;

  if (jd == null) {
    reasons.push("no_jd");
  }

  if (cost != null && jd != null && cost > SUBPRIME.idealCostMax && cost >= jd) {
    reasons.push("owned_over_book");
  }

  if (
    cost != null &&
    cost > SUBPRIME.acceptableCostMax &&
    (jd == null || jd - cost < SUBPRIME.thinSpreadMin)
  ) {
    reasons.push("thin_spread");
  }

  if (
    age > SUBPRIME.sellClockDays &&
    !(
      cost != null &&
      cost <= SUBPRIME.idealCostMax &&
      jd != null &&
      jd - cost >= SUBPRIME.agedSpreadMin
    )
  ) {
    reasons.push("aged_30_plus");
  }

  return reasons;
}

export function reasonLabel(r: SubprimeAuditReason): string {
  switch (r) {
    case "owned_over_book":
      return "Owned over book";
    case "thin_spread":
      return "Thin spread";
    case "no_jd":
      return "No JD value";
    case "aged_30_plus":
      return "30+ days";
  }
}

export function enrichSubprime(u: InvUnitRow): SubprimeAuditRow {
  const j115 = jd115(u.jd);
  const spread = u.jd != null && u.cost != null ? u.jd - u.cost : null;
  return {
    ...u,
    reasons: auditSubprimeUnit(u),
    jd115: j115,
    jd115MinusCost: j115 != null && u.cost != null ? j115 - u.cost : null,
    spread,
  };
}

export function subprimeInventory(units: InvUnitRow[]): SubprimeAuditRow[] {
  return units
    .filter((u) => u.disp === "subprime")
    .map(enrichSubprime)
    .sort((a, b) => (a.spread ?? -Infinity) - (b.spread ?? -Infinity));
}

export function subprimeAuditFlags(units: InvUnitRow[]): SubprimeAuditRow[] {
  return subprimeInventory(units).filter((u) => u.reasons.length > 0);
}

/** ALL inventory with jd <= bookFinderJdMax, sorted by jd-cost. */
export function bookSpreadCandidates(units: InvUnitRow[]): SubprimeAuditRow[] {
  return units
    .filter((u) => u.jd != null && u.jd <= SUBPRIME.bookFinderJdMax)
    .map(enrichSubprime)
    .sort((a, b) => (a.spread ?? -Infinity) - (b.spread ?? -Infinity));
}
