/** Fields the Sales Registry search box matches. */

export type RegistrySearchDeal = {
  stock_number: string | null;
  vin: string | null;
  customer_last_name: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

/**
 * True when every whitespace-separated token appears in stock #, VIN,
 * customer last name, year, make, or model. Token order does not matter,
 * so "2024 honda civic" matches a 2024 Honda Civic.
 */
export function dealMatchesRegistrySearch(
  deal: RegistrySearchDeal,
  search: string
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    deal.stock_number,
    deal.vin,
    deal.customer_last_name,
    deal.vehicle_year,
    deal.vehicle_make,
    deal.vehicle_model,
  ]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return query.split(/\s+/).every((token) => haystack.includes(token));
}
