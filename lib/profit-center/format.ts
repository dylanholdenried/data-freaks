/**
 * Shared display formatters for Profit Center pages.
 */

export const pcFmt$ = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
};

export const pcFmtN = (v: number | null | undefined, digits = 0) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

export const pcFmtPct = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(0)}%`;
};

export const pcFmtMiles = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString()} mi`;
};
