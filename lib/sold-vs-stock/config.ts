/**
 * Stocking decision thresholds for Sold vs Stock.
 * Tuned for rooftop-specific sold vs on-lot counts (not market MDS).
 */

/** Coverage (onLot / sold) below this → need more (when sold volume is meaningful). */
export const UNDER_COVERAGE = 0.5;

/** Coverage above this → too much (when absolute excess is also meaningful). */
export const OVER_COVERAGE = 1.5;

/** Min sold units in window before understock flags fire. */
export const MIN_SOLD_FOR_UNDER = 2;

/** Min on-lot with zero sales before overstock flags fire. */
export const MIN_STOCK_ZERO_SALES = 2;

/** Min absolute gap (sold − onLot) to flag need-more. */
export const MIN_UNDER_GAP = 2;

/** Min absolute excess (onLot − sold) to flag too-much. */
export const MIN_OVER_GAP = 3;

/** Age (days) that worsens an overstock signal. */
export const AGED_STOCK_DAYS = 45;