export const fmt$ = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
};

export const fmtN = (v: number | null, digits = 0) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

export const fmtPct = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(0)}%`;
};

export const fmtDelta$ = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmt$(v)}`;
};

export const fmtDeltaDays = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtN(v, 0)}d`;
};

/** Compact store pill labels (e.g. Jim Butler Centralia → CENTRALIA). */
export function storePillLabel(name: string) {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return jb[1].trim().toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!.toUpperCase();
  return n.toUpperCase();
}
