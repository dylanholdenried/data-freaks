/** MidMo Inventory Command helpers — colors, filters, called actions, veh parse. */

import { FULL_PHOTO_COUNT, INV_TARGETS, OVER_MARKET_POM, STALE_DAYS } from "./config";
import { isHotUnit, isTtlFail } from "./compute";
import type { InvUnitRow } from "./types";

export const IC = {
  bg: "#10141A",
  panel: "#171D26",
  border: "#232B37",
  rowAlt: "#141922",
  line: "#1E2530",
  text: "#EDF1F5",
  muted: "#93A0B0",
  green: "#2FBF71",
  greenSoft: "#8FD14F",
  yellow: "#F5C242",
  orange: "#F08C2E",
  red: "#E5484D",
  blue: "#7AA7FF",
  centralia: "#58B8E8",
  okBg: "#1F3A2C",
  badBg: "#5A2A2E",
  darkText: "#10141A",
} as const;

export const AGE_BUCKETS = ["0-30", "31-45", "46-60", "61-89", "90+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const AGE_BUCKET_COLORS: Record<AgeBucket, string> = {
  "0-30": IC.green,
  "31-45": IC.greenSoft,
  "46-60": IC.yellow,
  "61-89": IC.orange,
  "90+": IC.red,
};

export function ageBucket(age: number | null | undefined): AgeBucket {
  const a = age ?? 0;
  if (a <= 30) return "0-30";
  if (a <= 45) return "31-45";
  if (a <= 60) return "46-60";
  if (a <= 89) return "61-89";
  return "90+";
}

export function ageTone(age: number | null | undefined): string {
  const a = age ?? 0;
  if (a <= 45) return IC.green;
  if (a <= 60) return IC.yellow;
  if (a <= 89) return IC.orange;
  return IC.red;
}

export function pomTone(pom: number | null | undefined): string {
  if (pom == null) return IC.text;
  if (pom <= 100) return IC.green;
  if (pom <= 110) return IC.yellow;
  return IC.red;
}

export function photoTone(ph: number | null | undefined): string {
  const n = ph ?? 0;
  if (n === 0) return IC.red;
  if (n < FULL_PHOTO_COUNT) return IC.yellow;
  return IC.green;
}

export function mmrWater(u: Pick<InvUnitRow, "mmr" | "cost">): number | null {
  if (u.mmr == null || u.cost == null) return null;
  return u.mmr - u.cost;
}

export type CalledAction = { label: string; color: string };

/** Exact MidMo called-action priority order. */
export function calledAction(u: InvUnitRow): CalledAction {
  if ((u.age ?? 0) >= 120) {
    return { label: "Wholesale / auction run", color: IC.red };
  }
  if (u.pom != null && u.pom > OVER_MARKET_POM) {
    return { label: "Reprice to ≤100% mkt", color: IC.red };
  }
  if ((u.ph ?? 0) < FULL_PHOTO_COUNT) {
    return { label: "Photos first, then price", color: IC.orange };
  }
  if (u.vr != null && u.vr >= 1.5 && (u.vdp ?? 0) >= 20) {
    return { label: "Price move — demand exists", color: IC.yellow };
  }
  if ((u.dsr ?? 0) >= STALE_DAYS) {
    return { label: `Reprice today (stale ${u.dsr}d)`, color: IC.orange };
  }
  return { label: "Price move + spiff", color: IC.yellow };
}

const MULTI_WORD_MAKES = [
  "Land Rover",
  "Alfa Romeo",
  "Aston Martin",
  "Rolls Royce",
  "Mercedes Benz",
] as const;

export function parseVehMakeModel(veh: string | null | undefined): {
  make: string;
  model: string;
} {
  if (!veh?.trim()) return { make: "Unknown", model: "" };
  const parts = veh.trim().split(/\s+/);
  let i = 0;
  if (/^\d{4}$/.test(parts[0] ?? "")) i = 1;
  if (i >= parts.length) return { make: "Unknown", model: "" };

  let make = parts[i]!;
  if (i + 1 < parts.length) {
    const two = `${parts[i]} ${parts[i + 1]}`;
    if (
      MULTI_WORD_MAKES.some((m) => m.toLowerCase() === two.toLowerCase()) ||
      parts[i]?.toLowerCase() === "mercedes-benz"
    ) {
      make = parts[i]?.toLowerCase() === "mercedes-benz" ? "Mercedes-Benz" : two;
      i += 2;
    } else {
      i += 1;
    }
  } else {
    i += 1;
  }

  const rest = parts.slice(i);
  let model = rest[0] ?? "";
  if (rest.length > 1 && /^\d/.test(rest[1]!)) {
    model = `${rest[0]} ${rest[1]}`;
  }
  return { make, model };
}

export function storeShortLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("linn")) return "LINN";
  if (n.includes("centralia")) return "CENTRALIA";
  const first = name.split(/\s+/)[0] ?? name;
  return first.toUpperCase().slice(0, 12);
}

export function storeAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("centralia")) return IC.centralia;
  return IC.yellow;
}

export function formatExportDate(iso: string | null): string {
  if (!iso) return "—";
  // Prefer MM-DD style like MidMo when full ISO
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return iso;
}

export function retailNoPrice(units: InvUnitRow[]): InvUnitRow[] {
  return units.filter((u) => u.disp !== "subprime" && u.price == null);
}

export function retailStale(units: InvUnitRow[], days = STALE_DAYS): InvUnitRow[] {
  return units.filter((u) => u.disp !== "subprime" && (u.dsr ?? -1) >= days);
}

export function ttlFailUnits(units: InvUnitRow[]): InvUnitRow[] {
  return units.filter(isTtlFail);
}

export function hotUnits(units: InvUnitRow[], snapshotDate: string): InvUnitRow[] {
  return units.filter((u) => isHotUnit(u.age, snapshotDate));
}

export function seenButSkipped(units: InvUnitRow[]): InvUnitRow[] {
  return units
    .filter((u) => (u.age ?? 0) >= 7 && (u.srp ?? 0) >= 300 && (u.vr ?? 99) < 1)
    .sort((a, b) => (b.srp ?? 0) - (a.srp ?? 0));
}

export function withSrpPerDay(units: InvUnitRow[]): Array<InvUnitRow & { spd: number }> {
  return units
    .filter((u) => (u.age ?? 0) >= 7)
    .map((u) => ({
      ...u,
      spd: +(Math.max(u.srp ?? 0, 0) / Math.max(u.age ?? 1, 1)).toFixed(1),
    }))
    .sort((a, b) => b.spd - a.spd);
}

export function hottestDemand(units: InvUnitRow[], limit = 40): Array<InvUnitRow & { spd: number }> {
  return withSrpPerDay(units).slice(0, limit);
}

export function mostClicks(units: InvUnitRow[], limit = 40): InvUnitRow[] {
  return [...units].sort((a, b) => (b.vdp ?? 0) - (a.vdp ?? 0)).slice(0, limit);
}

export function overMarketUnits(units: InvUnitRow[]): InvUnitRow[] {
  return units.filter((u) => u.disp !== "subprime" && (u.pom ?? 0) > OVER_MARKET_POM);
}

export function buildToShort(unitsInStock: number): string {
  const short = INV_TARGETS.stock - unitsInStock;
  if (short > 0) return `build to ${INV_TARGETS.stock} · ${short} short`;
  if (short < 0) return `build to ${INV_TARGETS.stock} · ${Math.abs(short)} over`;
  return `build to ${INV_TARGETS.stock} · on target`;
}
