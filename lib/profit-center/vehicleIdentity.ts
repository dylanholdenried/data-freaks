/**
 * Canonical make/model identity for Profit Center.
 * Rollups key by lowercase; drill-down / filters must match the same way
 * so mixed-case DMS imports (CHEVROLET vs Chevrolet) stay consistent.
 */

export function normVeh(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Same key shape as model dimension aggregation (`label.toLowerCase()`). */
export function modelIdentityKey(make: string, model: string): string {
  return `${(make ?? "").trim()} ${(model ?? "").trim()}`.trim().toLowerCase();
}

export function sameMake(a: string, b: string): boolean {
  return normVeh(a) === normVeh(b);
}

export function sameModel(a: string, b: string): boolean {
  return normVeh(a) === normVeh(b);
}

export function dealMatchesMakeModel(
  deal: { vehicle_make: string; vehicle_model: string },
  make?: string | null,
  model?: string | null
): boolean {
  const wantMake = make?.trim() ? make : undefined;
  const wantModel = model?.trim() ? model : undefined;
  if (wantMake && !sameMake(deal.vehicle_make, wantMake)) return false;
  if (wantModel && !sameModel(deal.vehicle_model, wantModel)) return false;
  return Boolean(wantMake || wantModel);
}

function isAllCapsToken(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t === t.toUpperCase() && t !== t.toLowerCase();
}

/** Prefer mixed/title casing over ALL CAPS when collapsing duplicates. */
export function preferDisplayCasing(existing: string, candidate: string): string {
  const a = existing.trim();
  const b = candidate.trim();
  if (!a) return b;
  if (!b) return a;
  if (isAllCapsToken(a) && !isAllCapsToken(b)) return b;
  return a;
}

/** Unique values by case-insensitive key, keeping the nicest display casing. */
export function uniquePreservingPreferredCasing(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const raw of values) {
    const trimmed = raw?.trim() ?? "";
    if (!trimmed) continue;
    const key = normVeh(trimmed);
    const prev = map.get(key);
    map.set(key, prev ? preferDisplayCasing(prev, trimmed) : trimmed);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}
