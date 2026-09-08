/** Compact store labels for Acquire pills (e.g. Jim Butler Centralia → JB CENTRALIA). */
export function shortStoreLabel(name: string): string {
  const n = name.trim();
  const jb = /^jim\s+butler\s+(.+)$/i.exec(n);
  if (jb) return `JB ${jb[1].trim().toUpperCase()}`;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return n.toUpperCase();
  return parts
    .slice(-2)
    .map((p) => p.toUpperCase())
    .join(" ");
}

/** Parse `?stores=id1,id2` or legacy `?store=id` into a validated id list. */
export function parseStoreIdsParam(
  searchParams: Record<string, string | string[] | undefined>,
  validIds: string[]
): string[] {
  const valid = new Set(validIds);
  const raw = searchParams.stores ?? searchParams.store;
  const joined = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const parsed = joined
    .split(",")
    .map((s) => s.trim())
    .filter((id) => valid.has(id));
  if (parsed.length > 0) return Array.from(new Set(parsed));
  return [...validIds];
}

export function storesQueryString(selectedIds: string[], allIds: string[]): string {
  if (selectedIds.length === 0 || selectedIds.length === allIds.length) {
    return "";
  }
  return `stores=${selectedIds.join(",")}`;
}
