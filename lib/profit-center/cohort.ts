/**
 * Cohort drill-down URLs and deal matching for Profit Center.
 */

import { PRICE_BANDS, priceBandForSalePrice } from "./priceBands";
import { ODOMETER_BANDS, odometerBandForMiles } from "./odometerBands";
import type { ProfitDeal, ProfitFilters } from "./aggregate";

export type CohortFocus =
  | "model"
  | "acquisition"
  | "price"
  | "odometer"
  | "year"
  | "trim";

export type CohortParams = {
  focus: CohortFocus;
  /** Display / filter value (source name, band id, year, trim, or "Make Model"). */
  value?: string;
  make?: string;
  model?: string;
  preset?: string;
  storeId?: string;
  departmentName?: string;
};

export function modelSlug(make: string, model: string): string {
  return `${make} ${model}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build cohort query href (relative). */
export function cohortHref(params: CohortParams): string {
  const q = new URLSearchParams();
  q.set("focus", params.focus);
  if (params.focus === "model") {
    if (params.make) q.set("make", params.make);
    if (params.model) q.set("model", params.model);
    if (params.value) q.set("value", params.value);
  } else if (params.value) {
    q.set("value", params.value);
  }
  if (params.preset) q.set("preset", params.preset);
  if (params.storeId && params.storeId !== "all") q.set("store", params.storeId);
  if (params.departmentName && params.departmentName !== "all") {
    q.set("department", params.departmentName);
  }
  return `/app/profit-center/cohort?${q.toString()}`;
}

export function modelCohortHref(
  make: string,
  model: string,
  ctx: Pick<CohortParams, "preset" | "storeId" | "departmentName">
): string {
  const slug = modelSlug(make, model);
  const q = new URLSearchParams();
  q.set("make", make);
  q.set("model", model);
  if (ctx.preset) q.set("preset", ctx.preset);
  if (ctx.storeId && ctx.storeId !== "all") q.set("store", ctx.storeId);
  if (ctx.departmentName && ctx.departmentName !== "all") {
    q.set("department", ctx.departmentName);
  }
  return `/app/profit-center/models/${encodeURIComponent(slug)}?${q.toString()}`;
}

export function compareHref(params: {
  type: "model" | "acquisition" | "store";
  a: string;
  b?: string;
  /** Extra slice when type=store (e.g. acquisition name or model key). */
  slice?: string;
  sliceType?: "acquisition" | "model";
  preset?: string;
  storeId?: string;
  departmentName?: string;
}): string {
  const q = new URLSearchParams();
  q.set("type", params.type);
  q.set("a", params.a);
  if (params.b) q.set("b", params.b);
  if (params.slice) q.set("slice", params.slice);
  if (params.sliceType) q.set("sliceType", params.sliceType);
  if (params.preset) q.set("preset", params.preset);
  if (params.storeId && params.storeId !== "all") q.set("store", params.storeId);
  if (params.departmentName && params.departmentName !== "all") {
    q.set("department", params.departmentName);
  }
  return `/app/profit-center/compare?${q.toString()}`;
}

/** Parse "Make Model" label into make + model using deal catalog when possible. */
export function splitMakeModel(
  label: string,
  deals: ProfitDeal[]
): { make: string; model: string } {
  const trimmed = label.trim();
  const lowers = new Map<string, { make: string; model: string }>();
  for (const d of deals) {
    const key = `${d.vehicle_make} ${d.vehicle_model}`.trim().toLowerCase();
    if (!lowers.has(key)) {
      lowers.set(key, { make: d.vehicle_make, model: d.vehicle_model });
    }
  }
  const hit = lowers.get(trimmed.toLowerCase());
  if (hit) return hit;

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return { make: parts[0]!, model: parts.slice(1).join(" ") };
  }
  return { make: trimmed, model: "" };
}

export function dealMatchesCohort(
  deal: ProfitDeal,
  focus: CohortFocus,
  opts: { value?: string; make?: string; model?: string }
): boolean {
  switch (focus) {
    case "model": {
      if (opts.make && deal.vehicle_make !== opts.make) return false;
      if (opts.model && deal.vehicle_model !== opts.model) return false;
      if (!opts.make && !opts.model && opts.value) {
        const label = `${deal.vehicle_make} ${deal.vehicle_model}`.trim();
        return label.toLowerCase() === opts.value.toLowerCase();
      }
      return Boolean(opts.make || opts.model);
    }
    case "acquisition": {
      const src = deal.acquisition_source?.trim() || "(Unknown)";
      return src === opts.value;
    }
    case "price": {
      const band = priceBandForSalePrice(deal.sale_price);
      return band?.id === opts.value || band?.label === opts.value;
    }
    case "odometer": {
      const band = odometerBandForMiles(deal.odometer);
      return band?.id === opts.value || band?.label === opts.value;
    }
    case "year":
      return String(deal.vehicle_year) === opts.value;
    case "trim": {
      const trim = deal.trim?.trim() || "(Unknown)";
      return trim === opts.value;
    }
    default:
      return false;
  }
}

export function cohortTitle(
  focus: CohortFocus,
  opts: { value?: string; make?: string; model?: string }
): string {
  switch (focus) {
    case "model":
      if (opts.make && opts.model) return `${opts.make} ${opts.model}`;
      return opts.value ?? "Model";
    case "acquisition":
      return opts.value ? `Source: ${opts.value}` : "Acquisition";
    case "price": {
      const band = PRICE_BANDS.find(
        (b) => b.id === opts.value || b.label === opts.value
      );
      return `Sale price: ${band?.label ?? opts.value ?? "—"}`;
    }
    case "odometer": {
      const band = ODOMETER_BANDS.find(
        (b) => b.id === opts.value || b.label === opts.value
      );
      return `Odometer: ${band?.label ?? opts.value ?? "—"}`;
    }
    case "year":
      return `Year: ${opts.value ?? "—"}`;
    case "trim":
      return `Trim: ${opts.value ?? "—"}`;
    default:
      return "Cohort";
  }
}

export function filtersFromCohortContext(opts: {
  storeId?: string;
  departmentName?: string;
}): ProfitFilters {
  return {
    storeId: opts.storeId && opts.storeId !== "all" ? opts.storeId : "all",
    departmentName:
      opts.departmentName && opts.departmentName !== "all"
        ? opts.departmentName
        : "all",
    make: "all",
    model: "all",
    year: "all",
    priceBandId: "all",
    acquisition: "all",
    bodyStyle: "all",
    truckClass: "all",
    salespersonId: "all",
    financeType: "all",
  };
}

/** Sync main PC URL query (preset + store + department). */
export function profitCenterHref(opts: {
  preset: string;
  storeId?: string;
  departmentName?: string;
}): string {
  const q = new URLSearchParams();
  q.set("preset", opts.preset);
  if (opts.storeId && opts.storeId !== "all") q.set("store", opts.storeId);
  if (opts.departmentName && opts.departmentName !== "all") {
    q.set("department", opts.departmentName);
  }
  return `/app/profit-center?${q.toString()}`;
}
