/**
 * Map unsold Acquire purchases → Inventory Command InvUnitRow shape
 * so Overview can reuse Age Wall / Age Buckets / IC KPI helpers.
 */

import { allInCost, headerAgeDays } from "./cost";
import { exitOf } from "./performance-analytics";
import { isCompletedStage, type AcqPurchase } from "./types";
import { computeVr } from "@/lib/inventory-command/compute";
import type { InvDisposition, InvUnitRow } from "@/lib/inventory-command/types";

function dispositionOf(p: AcqPurchase): InvDisposition {
  const exit = exitOf(p);
  if (exit === "subprime") return "subprime";
  if (exit === "wholesale" || p.stage === "wholesale") return "wholesale";
  return "retail";
}

function vehicleLabel(p: AcqPurchase): string {
  return [p.vehicle_year, p.vehicle_make, p.vehicle_model, p.vehicle_trim]
    .filter((x) => x != null && String(x).trim() !== "")
    .map(String)
    .join(" ");
}

function costOf(p: AcqPurchase): number | null {
  if (p.live_cost != null && Number.isFinite(Number(p.live_cost))) {
    return Number(p.live_cost);
  }
  return allInCost(p);
}

function ageOf(p: AcqPurchase): number | null {
  if (p.live_age != null && Number.isFinite(Number(p.live_age))) {
    return Number(p.live_age);
  }
  return headerAgeDays(p);
}

function mmrOf(p: AcqPurchase): number | null {
  if (p.frozen_mmr != null) return Number(p.frozen_mmr);
  if (p.live_mmr != null) return Number(p.live_mmr);
  if (p.purchase_mmr != null) return Number(p.purchase_mmr);
  return null;
}

function jdOf(p: AcqPurchase): number | null {
  if (p.frozen_jd != null) return Number(p.frozen_jd);
  if (p.live_jd != null) return Number(p.live_jd);
  if (p.purchase_jd != null) return Number(p.purchase_jd);
  return null;
}

/** Unsold Acquire purchases in scope → IC unit rows. */
export function acquirePurchasesToInvUnits(
  purchases: AcqPurchase[]
): InvUnitRow[] {
  const unsold = purchases.filter((p) => !isCompletedStage(p.stage));
  const seen = new Map<string, number>();

  return unsold.map((p) => {
    const baseStk = (p.stock_number ?? "").trim() || `acq-${p.id.slice(0, 8)}`;
    const n = (seen.get(baseStk) ?? 0) + 1;
    seen.set(baseStk, n);
    const stk = n === 1 ? baseStk : `${baseStk}·${n}`;

    const srp = p.live_srp != null ? Number(p.live_srp) : null;
    const vdp = p.live_vdp != null ? Number(p.live_vdp) : null;

    return {
      stk,
      veh: vehicleLabel(p) || null,
      body: p.body_style,
      age: ageOf(p),
      ph: p.live_photo_count != null ? Number(p.live_photo_count) : null,
      cost: costOf(p),
      price: p.live_price != null ? Number(p.live_price) : null,
      pom: p.live_pom != null ? Number(p.live_pom) : null,
      dsr: null,
      srp,
      vdp,
      vr: computeVr(vdp, srp),
      mmr: mmrOf(p),
      jd: jdOf(p),
      pt: null,
      disp: dispositionOf(p),
      d_vdp: null,
      d_srp: null,
      d_p: null,
      d_ph: null,
    } satisfies InvUnitRow;
  });
}

/** Today as YYYY-MM-DD for hot-list threshold (matches IC snapshot date usage). */
export function acquireInventoryAsOfDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
