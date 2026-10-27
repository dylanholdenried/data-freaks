import { num } from "./cost";

export type PriceHistoryField = "cost" | "price";

export type PriceHistoryPoint = {
  /** Snapshot date YYYY-MM-DD */
  date: string;
  cost: number | null;
  price: number | null;
};

export type PriceHistoryEvent = {
  date: string;
  field: PriceHistoryField;
  label: string;
  from: number | null;
  to: number | null;
  /** to − from when both present; otherwise null */
  delta: number | null;
};

function sameMoney(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

/**
 * Collapse consecutive same-day rows (multiple uploads) to the latest values,
 * then emit cost / website-price change events newest-first.
 */
export function buildPriceHistoryEvents(points: PriceHistoryPoint[]): PriceHistoryEvent[] {
  if (!points.length) return [];

  const byDate = new Map<string, PriceHistoryPoint>();
  for (const p of points) {
    const date = p.date.slice(0, 10);
    if (!date) continue;
    // Later rows for the same date win (caller should order ascending by date, then created_at).
    byDate.set(date, {
      date,
      cost: p.cost == null ? null : num(p.cost),
      price: p.price == null ? null : num(p.price),
    });
  }

  const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const events: PriceHistoryEvent[] = [];

  let prevCost: number | null | undefined;
  let prevPrice: number | null | undefined;

  for (const row of series) {
    if (prevCost === undefined) {
      if (row.cost != null) {
        events.push({
          date: row.date,
          field: "cost",
          label: "Cost",
          from: null,
          to: row.cost,
          delta: null,
        });
      }
    } else if (!sameMoney(prevCost, row.cost)) {
      events.push({
        date: row.date,
        field: "cost",
        label: "Cost",
        from: prevCost,
        to: row.cost,
        delta: prevCost != null && row.cost != null ? row.cost - prevCost : null,
      });
    }

    if (prevPrice === undefined) {
      if (row.price != null) {
        events.push({
          date: row.date,
          field: "price",
          label: "Website price",
          from: null,
          to: row.price,
          delta: null,
        });
      }
    } else if (!sameMoney(prevPrice, row.price)) {
      events.push({
        date: row.date,
        field: "price",
        label: "Website price",
        from: prevPrice,
        to: row.price,
        delta: prevPrice != null && row.price != null ? row.price - prevPrice : null,
      });
    }

    prevCost = row.cost;
    prevPrice = row.price;
  }

  return events.sort((a, b) => {
    const byDateDesc = b.date.localeCompare(a.date);
    if (byDateDesc !== 0) return byDateDesc;
    // Same day: show price then cost for readability
    if (a.field === b.field) return 0;
    return a.field === "price" ? -1 : 1;
  });
}
