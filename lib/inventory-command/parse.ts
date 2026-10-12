import * as XLSX from "xlsx";
import {
  computeVr,
  daysSinceChange,
  excelSerialToDate,
  normalizeDisp,
  pomToPercent,
} from "./compute";
import type { InvUnitDetailFields, InvUnitRow } from "./types";
import { parseVehicleParts } from "./vehicle";

/** Human-readable CSV template headers (Stage 5 download). */
export const TEMPLATE_HEADERS = [
  "stk",
  "vin",
  "veh",
  "body",
  "age",
  "ph",
  "cost",
  "adj_cost_to_market",
  "price",
  "profittime_alignment",
  "markup",
  "pom",
  "last_price_change",
  "at_srp",
  "at_vdp",
  "cars_srp",
  "cars_vdp",
  "site_srp",
  "site_vdp",
  "mmr",
  "jd",
  "black_book_retail",
  "pt",
  "disp",
  "odometer",
] as const;

export type ParsedUnitBase = Omit<InvUnitRow, "d_vdp" | "d_srp" | "d_p" | "d_ph"> &
  InvUnitDetailFields & {
    raw: Record<string, string | number | boolean> | null;
  };

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

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function headerIndexMap(headers: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normHeader(h);
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

/** Full row keyed by the export's header text; blank cells are dropped. */
function buildRaw(row: unknown[], headers: unknown[]): Record<string, string | number | boolean> | null {
  const out: Record<string, string | number | boolean> = {};
  headers.forEach((h, i) => {
    const label = String(h ?? "").replace(/\s+/g, " ").trim() || `Column ${i + 1}`;
    const v = row[i];
    if (v == null || v === "") return;
    const key = label in out ? `${label} (${i + 1})` : label;
    if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else out[key] = String(v).trim();
  });
  return Object.keys(out).length > 0 ? out : null;
}

function marketPrice(price: number | null, pom: number | null): number | null {
  if (price == null || pom == null || pom <= 0) return null;
  return Math.round(price / (pom / 100));
}

function costToMarket(
  ctmRaw: number | null,
  cost: number | null,
  market: number | null
): number | null {
  const fromExport = pomToPercent(ctmRaw);
  if (fromExport != null) return fromExport;
  if (cost == null || market == null || market <= 0) return null;
  return Math.round((cost / market) * 1000) / 10;
}

function detailFields(opts: {
  veh: string | null;
  vin: unknown;
  odometer: unknown;
  ctm: unknown;
  ptAlign: unknown;
  markup: unknown;
  siteSrp: unknown;
  siteVdp: unknown;
  bbRetail: unknown;
  cost: number | null;
  price: number | null;
  pom: number | null;
}): InvUnitDetailFields {
  const parts = parseVehicleParts(opts.veh);
  const market = marketPrice(opts.price, opts.pom);
  const markup =
    toNum(opts.markup) ??
    (opts.price != null && opts.cost != null ? opts.price - opts.cost : null);
  return {
    vin: toStr(opts.vin)?.toUpperCase() ?? null,
    year: parts.year,
    make: parts.make,
    model: parts.model,
    trim: parts.trim,
    odometer: toInt(opts.odometer),
    ctm_pct: costToMarket(toNum(opts.ctm), opts.cost, market),
    pt_align: toStr(opts.ptAlign),
    markup,
    site_srp: toInt(opts.siteSrp),
    site_vdp: toInt(opts.siteVdp),
    bb_retail: toNum(opts.bbRetail),
    market_price: market,
  };
}

type VautoDetailCols = Record<
  "vin" | "odometer" | "ctm" | "ptAlign" | "markup" | "siteSrp" | "siteVdp" | "bbRetail",
  number
>;

/** Locates detail columns by header text; falls back to the confirmed export positions. */
function vautoDetailCols(headers: unknown[]): VautoDetailCols {
  const norm = headers.map(normHeader);
  const find = (match: (h: string) => boolean, fallbackIdx: number) => {
    const i = norm.findIndex((h) => h && match(h));
    return i >= 0 ? i : fallbackIdx;
  };
  const isSite = (h: string) => h.includes("site") || h.includes("eprocess");
  return {
    vin: find((h) => h === "vin", 1),
    odometer: find((h) => h === "odometer" || h === "miles", 30),
    ctm: find((h) => h.includes("cost_to_market"), 7),
    ptAlign: find((h) => h.includes("profittime_alignment"), 9),
    markup: find((h) => h === "markup", 10),
    siteSrp: find((h) => isSite(h) && h.endsWith("srp") && !h.includes("%"), 19),
    siteVdp: find((h) => isSite(h) && h.endsWith("vdp") && !h.includes("%"), 20),
    bbRetail: find((h) => h === "black_book_retail", 26),
  };
}

function rowFromVautoCols(
  row: unknown[],
  headers: unknown[],
  cols: VautoDetailCols,
  snapshotDate: string
): ParsedUnitBase | null {
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
  const veh = toStr(row[2]);

  return {
    stk,
    veh,
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
    ...detailFields({
      veh,
      vin: row[cols.vin],
      odometer: row[cols.odometer],
      ctm: row[cols.ctm],
      ptAlign: row[cols.ptAlign],
      markup: row[cols.markup],
      siteSrp: row[cols.siteSrp],
      siteVdp: row[cols.siteVdp],
      bbRetail: row[cols.bbRetail],
      cost,
      price,
      pom,
    }),
    raw: buildRaw(row, headers),
  };
}

function rowFromNamedCsv(
  row: unknown[],
  headerRow: unknown[],
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
  const pomRaw = toNum(
    get([
      "pom",
      "adjusted_%_of_market",
      "adj_%_of_market",
      "adj_%_mkt",
      "adj_%_mkt_value",
      "adj._%_mkt",
      "adj._%_of_market",
    ])
  );
  const pom = pomToPercent(pomRaw);
  const veh = toStr(get(["veh", "vehicle"]));
  const cost = toNum(get(["cost", "unit_cost"]));
  const price = toNum(get(["price", "list_price", "internet_price"]));

  return {
    stk,
    veh,
    body: toStr(get(["body"])),
    age: toInt(get(["age"])),
    ph: toInt(get(["ph", "photo_count"])),
    cost,
    price,
    pom,
    dsr: daysSinceChange(lastChange, snapshotDate),
    srp,
    vdp,
    vr: computeVr(vdp, srp),
    mmr: toNum(get(["mmr", "mmr_wholesale"])),
    jd: toNum(get(["jd", "j.d._power_trade_in", "jd_power_trade_in", "j.d._power_trade-in"])),
    pt: toStr(get(["pt", "profittime"])),
    disp: normalizeDisp(get(["disp", "disposition"])),
    ...detailFields({
      veh,
      vin: get(["vin"]),
      odometer: get(["odometer", "miles"]),
      ctm: get(["adj_cost_to_market", "ctm", "cost_to_market"]),
      ptAlign: get(["profittime_alignment", "pt_align"]),
      markup: get(["markup"]),
      siteSrp: get(["site_srp"]),
      siteVdp: get(["site_vdp"]),
      bbRetail: get(["black_book_retail", "bb_retail"]),
      cost,
      price,
      pom,
    }),
    raw: buildRaw(row, headerRow),
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

  const map = isCsvTemplate ? headerIndexMap(header) : null;
  const vautoCols = isCsvTemplate ? null : vautoDetailCols(header);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const parsed = map
      ? rowFromNamedCsv(row, header, map, snapshotDate)
      : rowFromVautoCols(row, header, vautoCols!, snapshotDate);
    if (!parsed) continue;
    if (seen.has(parsed.stk)) continue;
    seen.add(parsed.stk);
    out.push(parsed);
  }

  if (out.length === 0) throw new Error("No inventory rows parsed from export");
  return out;
}
