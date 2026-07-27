/**
 * Red → green heatmap for Profit Center numeric columns.
 * Higher-is-better metrics: green at high end.
 * Lower-is-better (age): green at low end.
 */

export type HeatPolarity = "higherBetter" | "lowerBetter";

export function heatmapStyle(
  value: number | null,
  min: number,
  max: number,
  polarity: HeatPolarity
): { backgroundColor: string; color: string } | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { backgroundColor: "rgba(148, 163, 184, 0.15)", color: "#0f172a" };
  }

  let t = (value - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (polarity === "lowerBetter") t = 1 - t;

  // t=0 red-ish, t=1 green-ish (Excel-like)
  const r = Math.round(220 + (34 - 220) * t);
  const g = Math.round(68 + (197 - 68) * t);
  const b = Math.round(68 + (94 - 68) * t);
  const bg = `rgba(${r}, ${g}, ${b}, 0.28)`;
  const text = t > 0.55 ? "#14532d" : t < 0.35 ? "#7f1d1d" : "#0f172a";
  return { backgroundColor: bg, color: text };
}

export function columnExtent(
  values: (number | null)[]
): { min: number; max: number } | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
