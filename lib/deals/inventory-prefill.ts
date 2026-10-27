import type { SupabaseClient } from "@supabase/supabase-js";
import { parseVehicleParts } from "@/lib/inventory-command/vehicle";
import { DRIVETRAINS, mapBodyStyle } from "@/lib/vehicle";

export type InventoryPrefill = {
  /** Trimmed stock number used for the lookup. */
  stock: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  /** Sales Registry body style, or blank when the inventory label does not map. */
  bodyStyle: string;
  label: string;
};

/** Map a vAuto body label onto the deal form's body-style list. */
export function inventoryBodyStyle(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (!text) return "";
  const s = text.toLowerCase();
  if (s.includes("convertible") || s.includes("cabriolet")) return "Convertible";
  if (s.includes("passenger van") || s.includes("minivan")) return "Minivan";
  if (s.includes("cargo")) return "Cargo Van";
  if (
    s.includes("cab") ||
    s.includes("supercrew") ||
    s.includes("crewmax") ||
    s.includes("pickup") ||
    s.includes("truck")
  ) {
    return "Truck";
  }
  return mapBodyStyle(text);
}

/** Map a VIN-decode drive type onto FWD / RWD / AWD / 4WD. */
export function catalogDrivetrain(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "";
  if ((DRIVETRAINS as readonly string[]).includes(s)) return s;
  if (s.includes("4WD") || s.includes("4X4") || s.includes("4-WHEEL") || s.includes("FOUR")) {
    return "4WD";
  }
  if (s.includes("AWD") || s.includes("ALL")) return "AWD";
  if (s.includes("RWD") || s.includes("REAR")) return "RWD";
  if (s.includes("FWD") || s.includes("FRONT")) return "FWD";
  const first = s.split(/[\s/,]+/)[0] ?? "";
  return (DRIVETRAINS as readonly string[]).includes(first) ? first : "";
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Vehicle on the store's latest Inventory Command snapshot, matched by stock number.
 * Older snapshots are ignored so a sold unit does not fill a new deal.
 */
export async function findInventoryPrefill(
  supabase: SupabaseClient,
  storeId: string,
  stockNumber: string
): Promise<InventoryPrefill | null> {
  const stock = stockNumber.trim();
  if (!storeId || !stock) return null;

  const { data: snap, error: snapError } = await supabase
    .from("inv_snapshots")
    .select("id")
    .eq("store_id", storeId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapError) throw new Error(snapError.message);
  if (!snap) return null;

  const { data: rows, error } = await supabase
    .from("inv_units")
    .select("stk,vin,year,make,model,trim,body,veh")
    .eq("snapshot_id", snap.id)
    .ilike("stk", escapeIlike(stock));
  if (error) throw new Error(error.message);

  const key = stock.toUpperCase();
  const row = (rows ?? []).find((r) => String(r.stk ?? "").trim().toUpperCase() === key);
  if (!row) return null;

  const parts = parseVehicleParts(typeof row.veh === "string" ? row.veh : null);
  const yearNum = typeof row.year === "number" ? row.year : parts.year;
  const make = (typeof row.make === "string" && row.make.trim()) || parts.make || "";
  const model = (typeof row.model === "string" && row.model.trim()) || parts.model || "";
  const trim = (typeof row.trim === "string" && row.trim.trim()) || parts.trim || "";
  const vin = (typeof row.vin === "string" ? row.vin : "").trim().toUpperCase();
  const bodyStyle = inventoryBodyStyle(typeof row.body === "string" ? row.body : null);
  const label = [yearNum, make, model, trim].filter(Boolean).join(" ");

  return {
    stock: key,
    vin,
    year: yearNum != null ? String(yearNum) : "",
    make,
    model,
    trim,
    bodyStyle,
    label: label || (typeof row.veh === "string" ? row.veh : key),
  };
}
