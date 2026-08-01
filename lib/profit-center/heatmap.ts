/**
 * Red → green heatmap for Profit Center numeric columns (dark UI).
 * Higher-is-better metrics: green at high end.
 * Lower-is-better (age/turn): green at low end.
 */

export type HeatPolarity = "higherBetter" | "lowerBetter";

const GREEN = { r: 46, g: 204, b: 113 }; // #2ecc71
const AMBER = { r: 255, g: 176, b: 32 }; // #ffb020
const RED = { r: 255, g: 92, b: 92 }; // #ff5c5c
const MUTED = "#8b94a3";
const TEXT = "#e8ecf2";

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function mix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
) {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

/** Interpolate red → amber → green for t in [0,1]. */
function colorAt(t: number): { r: number; g: number; b: number } {
  if (t < 0.5) return mix(RED, AMBER, t * 2);
  return mix(AMBER, GREEN, (t - 0.5) * 2);
}

export function heatmapStyle(
  value: number | null,
  min: number,
  max: number,
  polarity: HeatPolarity
): { backgroundColor: string; color: string } | undefined {
  if (value == null || !Number.isFinite(value)) {
    return { backgroundColor: "transparent", color: MUTED };
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { backgroundColor: "rgba(139, 148, 163, 0.12)", color: TEXT };
  }

  let t = (value - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (polarity === "lowerBetter") t = 1 - t;

  const c = colorAt(t);
  const bg = `rgba(${c.r}, ${c.g}, ${c.b}, 0.18)`;
  // Crisp saturated text — always match status color, not dark-on-light
  const color =
    t > 0.62
      ? `rgb(${GREEN.r}, ${GREEN.g}, ${GREEN.b})`
      : t < 0.38
        ? `rgb(${RED.r}, ${RED.g}, ${RED.b})`
        : `rgb(${AMBER.r}, ${AMBER.g}, ${AMBER.b})`;

  return { backgroundColor: bg, color };
}

export function columnExtent(
  values: (number | null)[]
): { min: number; max: number } | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Bar/chart color from normalized turn or profit (0 bad → 1 good). */
export function statusRgb(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const c = colorAt(clamped);
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}
