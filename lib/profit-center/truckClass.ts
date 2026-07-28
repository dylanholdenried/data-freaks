/** Derived truck class labels used in Profit Center. */
export const TRUCK_CLASS_LABELS = [
  "1500",
  "2500",
  "3500",
  "4500+",
  "(No class)",
] as const;

export type TruckClassLabel = (typeof TRUCK_CLASS_LABELS)[number];

const NO_CLASS: TruckClassLabel = "(No class)";

function labelForTonnage(n: number): TruckClassLabel | null {
  if (n === 1500) return "1500";
  if (n === 2500) return "2500";
  if (n === 3500) return "3500";
  if (n === 4500 || n === 5500 || n === 6500) return "4500+";
  return null;
}

/**
 * Infer light-duty / HD truck class from make + model text.
 * Does not require body_style === Truck — unmatched vehicles return "(No class)".
 */
export function inferTruckClass(
  make: string | null | undefined,
  model: string | null | undefined
): TruckClassLabel {
  const text = `${make ?? ""} ${model ?? ""}`.trim();
  if (!text) return NO_CLASS;

  // Ford-style: F-150, F150, F 250, etc. → 1500 / 2500 / …
  const ford = text.match(/\bf[-\s]?([1-6])50\b/i);
  if (ford) {
    const labeled = labelForTonnage(Number(ford[1]) * 1000 + 500);
    if (labeled) return labeled;
  }

  // Whole-token tonnages: Silverado 1500, Ram 2500, Sierra 3500 HD, …
  const tonnage = text.match(/\b([1-6]500)\b/);
  if (tonnage) {
    const labeled = labelForTonnage(Number(tonnage[1]));
    if (labeled) return labeled;
  }

  return NO_CLASS;
}
