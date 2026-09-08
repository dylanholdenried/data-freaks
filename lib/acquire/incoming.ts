import type { AcqPurchase, AcqSourceType } from "./types";

/** Fields required to graduate out of Incoming. */
export type IncomingInput = {
  vehicle_year: number | null | undefined;
  vehicle_make: string | null | undefined;
  vehicle_model: string | null | undefined;
  source_type: AcqSourceType | string | null | undefined;
  purchase_date: string | null | undefined;
  purchase_price: number | null | undefined;
  vin: string | null | undefined;
  stock_number: string | null | undefined;
};

export function computeIsIncoming(input: IncomingInput): boolean {
  const year = input.vehicle_year;
  const make = (input.vehicle_make ?? "").trim();
  const model = (input.vehicle_model ?? "").trim();
  const source = input.source_type;
  const date = (input.purchase_date ?? "").trim();
  const price = input.purchase_price;
  const vin = (input.vin ?? "").trim();
  const stock = (input.stock_number ?? "").trim();

  if (year == null || !Number.isFinite(year)) return true;
  if (!make || !model) return true;
  if (!source) return true;
  if (!date) return true;
  if (price == null || !Number.isFinite(Number(price))) return true;
  if (!vin && !stock) return true;
  return false;
}

export function daysSincePurchase(
  purchaseDate: string | null | undefined,
  now = new Date()
): number | null {
  if (!purchaseDate) return null;
  const d = new Date(`${purchaseDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function displayYmm(p: Pick<AcqPurchase, "vehicle_year" | "vehicle_make" | "vehicle_model">): string {
  const parts = [p.vehicle_year, p.vehicle_make, p.vehicle_model].filter(
    (x) => x != null && String(x).trim() !== ""
  );
  return parts.length ? parts.join(" ") : "Unknown vehicle";
}
