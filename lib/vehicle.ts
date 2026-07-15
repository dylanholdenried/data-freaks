// ── Static option lists ───────────────────────────────────────────────────────

export const GM_MAKES = new Set(["Chevrolet", "GMC"]);
export const TONNAGES = new Set(["1500", "2500", "3500", "4500", "5500", "6500"]);

export const COLORS = [
  "White", "Black", "Silver", "Gray", "Red", "Blue", "Green",
  "Brown", "Beige", "Gold", "Orange", "Yellow", "Purple", "Maroon", "Tan", "Other",
];

export const BODY_STYLES = [
  "Sedan", "SUV", "Truck", "Cargo Van", "Minivan",
  "Hatchback", "Coupe", "Convertible", "Wagon", "Cab/Chassis",
];

export const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];

// ── Normalization helpers ─────────────────────────────────────────────────────

export function mapBodyStyle(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("sport utility") || s.includes("suv") || s.includes("mpv"))
    return "SUV";
  if (s.includes("pickup") || s.includes("truck")) return "Truck";
  if (s.includes("cab chassis") || s.includes("incomplete")) return "Cab/Chassis";
  if (s.includes("minivan")) return "Minivan";
  if (s.includes("van")) return "Cargo Van";
  if (s.includes("hatchback") || s.includes("liftback")) return "Hatchback";
  if (s.includes("convertible") || s.includes("cabriolet")) return "Convertible";
  if (s.includes("coupe")) return "Coupe";
  if (s.includes("wagon")) return "Wagon";
  if (s.includes("sedan") || s.includes("saloon")) return "Sedan";
  return "";
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

export async function decodeVin(vin: string): Promise<DecodedVehicle> {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`
  );
  if (!res.ok) {
    throw new VinDecodeError("Could not decode this VIN — enter details manually.");
  }

  const json = await res.json();
  const results: { Variable: string; Value: string | null }[] = json.Results ?? [];

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
  const drivetrain = rawDrive ? rawDrive.split("/")[0].trim() : "";
  const parsedYear = rawYear ? parseInt(rawYear, 10) : null;
  const year = parsedYear && !isNaN(parsedYear) ? parsedYear : null;

  const { model, trim, bodyStyle } = normalizeDecodedVehicle(make, rawModel, rawSeries, rawBody);

  return { year, make, model, trim, bodyStyle, drivetrain };
}
