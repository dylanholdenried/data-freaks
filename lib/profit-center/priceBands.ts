/** Fixed sale-price bands matching the Excel Profit Center sheet. */

export type PriceBand = {
  id: string;
  label: string;
  min: number;
  /** Inclusive max; null = open-ended */
  max: number | null;
};

export const PRICE_BANDS: PriceBand[] = [
  { id: "0-5000", label: "$0 – $5,000", min: 0, max: 5000 },
  { id: "5001-10000", label: "$5,001 – $10,000", min: 5001, max: 10000 },
  { id: "10001-15000", label: "$10,001 – $15,000", min: 10001, max: 15000 },
  { id: "15001-20000", label: "$15,001 – $20,000", min: 15001, max: 20000 },
  { id: "20001-25000", label: "$20,001 – $25,000", min: 20001, max: 25000 },
  { id: "25001-30000", label: "$25,001 – $30,000", min: 25001, max: 30000 },
  { id: "30001-35000", label: "$30,001 – $35,000", min: 30001, max: 35000 },
  { id: "35001-40000", label: "$35,001 – $40,000", min: 35001, max: 40000 },
  { id: "40001-45000", label: "$40,001 – $45,000", min: 40001, max: 45000 },
  { id: "45001-50000", label: "$45,001 – $50,000", min: 45001, max: 50000 },
  { id: "50001-60000", label: "$50,001 – $60,000", min: 50001, max: 60000 },
  { id: "60001-75000", label: "$60,001 – $75,000", min: 60001, max: 74999.99 },
  { id: "75000-100000", label: "$75,000 – $100,000", min: 75000, max: 100000 },
  { id: "100000+", label: "$100,000+", min: 100000.01, max: null },
];

export function priceBandForSalePrice(salePrice: number | null): PriceBand | null {
  if (salePrice == null || !Number.isFinite(salePrice)) return null;
  for (const band of PRICE_BANDS) {
    if (salePrice < band.min) continue;
    if (band.max == null || salePrice <= band.max) return band;
  }
  return null;
}
