/** Fixed odometer bands for Profit Center rollups. */

export type OdometerBand = {
  id: string;
  label: string;
  min: number;
  /** Inclusive max; null = open-ended */
  max: number | null;
};

export const ODOMETER_BANDS: OdometerBand[] = [
  { id: "0-9999", label: "0 – 9,999", min: 0, max: 9999 },
  { id: "10000-19999", label: "10,000 – 19,999", min: 10000, max: 19999 },
  { id: "20000-35999", label: "20,000 – 35,999", min: 20000, max: 35999 },
  { id: "36000-49999", label: "36,000 – 49,999", min: 36000, max: 49999 },
  { id: "50000-59999", label: "50,000 – 59,999", min: 50000, max: 59999 },
  { id: "60000-79999", label: "60,000 – 79,999", min: 60000, max: 79999 },
  { id: "80000-99999", label: "80,000 – 99,999", min: 80000, max: 99999 },
  { id: "100000-124999", label: "100,000 – 124,999", min: 100000, max: 124999 },
  { id: "125000-149999", label: "125,000 – 149,999", min: 125000, max: 149999 },
  { id: "150000+", label: "150,000+", min: 150000, max: null },
];

export function odometerBandForMiles(
  odometer: number | null
): OdometerBand | null {
  if (odometer == null || !Number.isFinite(odometer) || odometer < 0) {
    return null;
  }
  for (const band of ODOMETER_BANDS) {
    if (odometer < band.min) continue;
    if (band.max == null || odometer <= band.max) return band;
  }
  return null;
}
