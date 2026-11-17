// ── Static option lists ───────────────────────────────────────────────────────

export const GM_MAKES = new Set(["Chevrolet", "GMC"]);
export const TONNAGES = new Set(["1500", "2500", "3500", "4500", "5500", "6500"]);

export const COLORS = [
  "White", "Black", "Silver", "Gray", "Red", "Blue", "Green",
  "Brown", "Beige", "Gold", "Orange", "Yellow", "Purple", "Maroon", "Tan", "Other",
];

export const BODY_STYLES = [
  "Sedan", "SUV", "Truck", "Cargo Van", "Minivan",
  "Hatchback", "Coupe", "Convertible",
];

export const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];

// ── Normalization helpers ─────────────────────────────────────────────────────

export function mapBodyStyle(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("sport utility") || s.includes("suv") || s.includes("mpv"))
    return "SUV";
  if (s.includes("pickup") || s.includes("truck")) return "Truck";
  if (s.includes("minivan")) return "Minivan";
  if (s.includes("van")) return "Cargo Van";
  if (s.includes("hatchback") || s.includes("liftback")) return "Hatchback";
  if (s.includes("convertible") || s.includes("cabriolet")) return "Convertible";
  if (s.includes("coupe")) return "Coupe";
  if (s.includes("sedan") || s.includes("saloon")) return "Sedan";
  return "";
}

/** Map NHTSA drive-type strings onto DRIVETRAINS. */
export function normalizeDrivetrain(raw: string): string {
  const s = raw.trim().toUpperCase();
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

export function normalizeDecodedVehicle(
  normMake: string,
  rawModel: string,
  rawSeries: string,
  rawBody: string,
): { model: string; trim: string; bodyStyle: string } {
  let model = rawModel;
  let trim = rawSeries;

  // Rule 1: GM tonnage — move tonnage from trim into model, clear trim
  if (GM_MAKES.has(normMake) && TONNAGES.has(rawSeries.trim())) {
    model = rawModel.replace(/ HD$/i, "").trim() + " " + rawSeries.trim();
    trim = "";
  }

  return { model, trim, bodyStyle: mapBodyStyle(rawBody) };
}

/** Empty allow-list for a department = any make allowed. Compare case-insensitively. */
export function isMakeAllowedForDepartment(
  make: string,
  departmentId: string,
  departmentMakes: { department_id: string; make: string }[]
): boolean {
  const allowed = departmentMakes
    .filter((row) => row.department_id === departmentId)
    .map((row) => row.make.toUpperCase());
  if (allowed.length === 0) return true;
  return allowed.includes(make.trim().toUpperCase());
}

// ── VIN decoder ───────────────────────────────────────────────────────────────

export type DecodedVehicle = {
  year: number | null;
  make: string;      // Title Case
  model: string;     // post-normalization
  trim: string;
  bodyStyle: string;
  drivetrain: string;
};

export class VinDecodeError extends Error {}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase();
}

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(normalizeVin(vin));
}

type NhtsaResultRow = { Variable: string; Value: string | null };

/** Parse NHTSA decodevin Results[] into our DecodedVehicle shape. */
export function parseNhtsaVinResults(results: NhtsaResultRow[]): DecodedVehicle {
  function get(variable: string): string {
    return results.find((r) => r.Variable === variable)?.Value?.trim() ?? "";
  }

  const rawYear = get("Model Year");
  const rawMake = get("Make");
  const rawModel = get("Model");
  const rawSeries = get("Series") || get("Trim");
  const rawBody = get("Body Class");
  const rawDrive = get("Drive Type");

  if (!rawMake) {
    throw new VinDecodeError("Could not decode this VIN — enter details manually.");
  }

  const make = rawMake.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const drivetrain = normalizeDrivetrain(rawDrive);
  const parsedYear = rawYear ? parseInt(rawYear, 10) : null;
  const year = parsedYear && !isNaN(parsedYear) ? parsedYear : null;

  const { model, trim, bodyStyle } = normalizeDecodedVehicle(make, rawModel, rawSeries, rawBody);

  return { year, make, model, trim, bodyStyle, drivetrain };
}

/**
 * Decode a VIN via our same-origin API (server calls NHTSA).
 * Dealership networks often block *.gov / external hosts in the browser —
 * the same failure mode that required the /sb Supabase proxy.
 */
export async function decodeVin(vin: string): Promise<DecodedVehicle> {
  const cleaned = normalizeVin(vin);
  if (!isValidVin(cleaned)) {
    throw new VinDecodeError("VIN must be 17 characters to decode.");
  }

  let res: Response;
  try {
    res = await fetch(`/api/vin/decode?vin=${encodeURIComponent(cleaned)}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new VinDecodeError(
      "Couldn't reach the VIN decoder — check your internet connection and try again."
    );
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Could not decode this VIN — enter details manually.";
    throw new VinDecodeError(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new VinDecodeError("Could not decode this VIN — enter details manually.");
  }

  const data = payload as Partial<DecodedVehicle>;
  return {
    year: typeof data.year === "number" ? data.year : null,
    make: typeof data.make === "string" ? data.make : "",
    model: typeof data.model === "string" ? data.model : "",
    trim: typeof data.trim === "string" ? data.trim : "",
    bodyStyle: typeof data.bodyStyle === "string" ? data.bodyStyle : "",
    drivetrain: typeof data.drivetrain === "string" ? data.drivetrain : "",
  };
}
