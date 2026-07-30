import * as XLSX from "xlsx";
import {
  computeVr,
  daysSinceChange,
  excelSerialToDate,
  normalizeDisp,
  pomToPercent,
} from "./compute";
import type { InvUnitRow } from "./types";

/** Human-readable CSV template headers (Stage 5 download). */
export const TEMPLATE_HEADERS = [
  "stk",
  "veh",
  "body",
  "age",
  "ph",
  "cost",
  "price",
  "pom",
  "last_price_change",
  "at_srp",
  "at_vdp",
  "cars_srp",
  "cars_vdp",
  "mmr",
  "jd",
  "pt",
  "disp",
] as const;

export type ParsedUnitBase = Omit<InvUnitRow, "d_vdp" | "d_srp" | "d_p" | "d_ph">;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/[$,%\s,]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseLastChange(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return excelSerialToDate(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO or MM/DD/YYYY
  const iso = Date.parse(s);
  if (Number.isFinite(iso)) return new Date(iso);
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000) return excelSerialToDate(asNum);
  return null;
}

function rowFromVautoCols(row: unknown[], snapshotDate: string): ParsedUnitBase | null {
  const stk = toStr(row[0]);
  if (!stk) return null;

  const age = toInt(row[4]);
  const ph = toInt(row[5]);
  const cost = toNum(row[6]);
  const price = toNum(row[8]);
  const pom = pomToPercent(toNum(row[11]));
  const lastChange = parseLastChange(row[12]);
  const dsr = daysSinceChange(lastChange, snapshotDate);

  const atSrp = toInt(row[13]) ?? 0;
  const atVdp = toInt(row[14]) ?? 0;
  const carsSrp = toInt(row[16]) ?? 0;
  const carsVdp = toInt(row[17]) ?? 0;
  const srp = atSrp + carsSrp;
  const vdp = atVdp + carsVdp;

  return {
    stk,
    veh: toStr(row[2]),
    body: toStr(row[3]),
    age,
    ph,
    cost,
    price,
    pom,
    dsr,
    srp,
    vdp,
    vr: computeVr(vdp, srp),
    mmr: toNum(row[22]),
    jd: toNum(row[24]),
    pt: toStr(row[28]),
    disp: normalizeDisp(row[29]),
  };
}

function headerIndexMap(headers: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (key) map.set(key, i);
  });
  return map;
}

function rowFromNamedCsv(
  row: unknown[],
  headers: Map<string, number>,
  snapshotDate: string
): ParsedUnitBase | null {
  const get = (names: string[]) => {
    for (const n of names) {
      const i = headers.get(n);
      if (i != null) return row[i];
    }
    return null;
  };

  const stk = toStr(get(["stk", "stock_#", "stock"]));
  if (!stk) return null;

  const atSrp = toInt(get(["at_srp", "autotrader_srp"])) ?? 0;
  const atVdp = toInt(get(["at_vdp", "autotrader_vdp"])) ?? 0;
  const carsSrp = toInt(get(["cars_srp", "cars.com_srp"])) ?? 0;
  const carsVdp = toInt(get(["cars_vdp", "cars.com_vdp"])) ?? 0;
  const srp = atSrp + carsSrp;
  const vdp = atVdp + carsVdp;
  const lastChange = parseLastChange(get(["last_price_change", "last_$_change"]));

  // pom may already be percent in template
  let pomRaw = toNum(get(["pom", "adjusted_%_of_market"]));
  const pom = pomToPercent(pomRaw);

  return {
    stk,
    veh: toStr(get(["veh", "vehicle"])),
    body: toStr(get(["body"])),
    age: toInt(get(["age"])),
    ph: toInt(get(["ph", "photo_count"])),
    cost: toNum(get(["cost", "unit_cost"])),
    price: toNum(get(["price"])),
    pom,
    dsr: daysSinceChange(lastChange, snapshotDate),
    srp,
    vdp,
    vr: computeVr(vdp, srp),
    mmr: toNum(get(["mmr", "mmr_wholesale"])),
    jd: toNum(get(["jd", "j.d._power_trade_in", "jd_power_trade_in"])),
    pt: toStr(get(["pt", "profittime"])),
    disp: normalizeDisp(get(["disp"])),
  };
}

function looksLikeTemplateHeaders(headers: unknown[]): boolean {
  const joined = headers.map((h) => String(h ?? "").toLowerCase()).join("|");
  return joined.includes("stk") && (joined.includes("at_srp") || joined.includes("veh"));
}

/**
 * Parse vAuto Merchandising .xls/.xlsx or our CSV template.
 * Binary buffer or UTF-8 string for CSV.
 */
export function parseVautoExport(
  input: Buffer | ArrayBuffer | string,
  snapshotDate: string,
  filename?: string
): ParsedUnitBase[] {
  const wb =
    typeof input === "string"
      ? XLSX.read(input, { type: "string", cellDates: false })
      : XLSX.read(input, { type: "buffer", cellDates: false });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (rows.length < 2) throw new Error("Export has no data rows");

  const header = rows[0] ?? [];
  const isCsvTemplate =
    (filename && filename.toLowerCase().endsWith(".csv")) || looksLikeTemplateHeaders(header);

  const out: ParsedUnitBase[] = [];
  const seen = new Set<string>();

  if (isCsvTemplate) {
    const map = headerIndexMap(header);
    for (let i = 1; i < rows.length; i++) {
      const parsed = rowFromNamedCsv(rows[i] ?? [], map, snapshotDate);
      if (!parsed) continue;
      if (seen.has(parsed.stk)) continue;
      seen.add(parsed.stk);
      out.push(parsed);
    }
  } else {
    for (let i = 1; i < rows.length; i++) {
      const parsed = rowFromVautoCols(rows[i] ?? [], snapshotDate);
      if (!parsed) continue;
      if (seen.has(parsed.stk)) continue;
      seen.add(parsed.stk);
      out.push(parsed);
    }
  }

  if (out.length === 0) throw new Error("No inventory rows parsed from export");
  return out;
}
