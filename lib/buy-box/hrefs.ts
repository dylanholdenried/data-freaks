/** Buy-Box navigation helpers. */

export function buyBoxHref(opts?: {
  preset?: string;
  storeId?: string;
}): string {
  const q = new URLSearchParams();
  if (opts?.preset && opts.preset !== "mtd") q.set("preset", opts.preset);
  if (opts?.storeId && opts.storeId !== "all") q.set("store", opts.storeId);
  const qs = q.toString();
  return qs ? `/app/buy-box?${qs}` : "/app/buy-box";
}

export function buyBoxModelDealsHref(opts: {
  make: string;
  model: string;
  preset?: string;
  storeId?: string;
}): string {
  const q = new URLSearchParams();
  q.set("make", opts.make);
  q.set("model", opts.model);
  if (opts.preset && opts.preset !== "mtd") q.set("preset", opts.preset);
  if (opts.storeId && opts.storeId !== "all") q.set("store", opts.storeId);
  return `/app/buy-box/deals?${q.toString()}`;
}

export function modelKey(make: string, model: string): string {
  return `${make.trim().toUpperCase()}||${model.trim().toUpperCase()}`;
}
