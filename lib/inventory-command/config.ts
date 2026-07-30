/** Single source of truth for Inventory Command targets and subprime thresholds. */

export const INV_TARGETS = {
  stock: 225,
  turnDays: 45,
  ttlDays: 5,
  grossPerUnit: 4000,
} as const;

export const SUBPRIME = {
  idealCostMax: 20_000,
  acceptableCostMax: 25_000,
  thinSpreadMin: 3_000,
  agedSpreadMin: 1_500,
  sellClockDays: 30,
  targetRetailJdMult: 1.15,
  bookFinderJdMax: 25_000,
} as const;

/** Photo count considered "full" merchandising. */
export const FULL_PHOTO_COUNT = 16;

/** Retail price stale threshold (days since change). */
export const STALE_DAYS = 7;
export const STALE_14_DAYS = 14;

/** Over % of market flag for Pricing tab. */
export const OVER_MARKET_POM = 110;
