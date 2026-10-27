export type StockAction = "need_more" | "balanced" | "too_much" | "watch";

export type SoldVsStockUnit = {
  store_id: string;
  stk: string;
  veh: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  age: number | null;
  cost: number | null;
  price: number | null;
  disp: string | null;
};

export type SoldVsStockDeal = {
  id: string;
  sale_date: string;
  store_id: string;
  department_id: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  trim: string | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_price: number | null;
  age: number | null;
};

export type SoldVsStockChildRow = {
  key: string;
  label: string;
  year: number | null;
  trim: string | null;
  sold: number;
  soldPrior: number;
  onLot: number;
  avgAge: number | null;
  maxAge: number | null;
  over45: number;
  totalCost: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  coverage: number | null;
  gap: number;
  daysToStockout: number | null;
  velocityDelta: number;
  action: StockAction;
  why: string;
  children?: SoldVsStockChildRow[];
};

export type SoldVsStockModelRow = {
  key: string;
  make: string;
  model: string;
  label: string;
  sold: number;
  soldPrior: number;
  onLot: number;
  avgAge: number | null;
  maxAge: number | null;
  over45: number;
  totalCost: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  /** onLot / sold when sold > 0 */
  coverage: number | null;
  /** sold − onLot (positive = short vs sales) */
  gap: number;
  daysToStockout: number | null;
  velocityDelta: number;
  action: StockAction;
  why: string;
  /** Priority score for sorting (higher = more urgent) */
  urgency: number;
  years: SoldVsStockChildRow[];
};

export type SoldVsStockSummary = {
  models: number;
  sold: number;
  onLot: number;
  needMore: number;
  tooMuch: number;
  balanced: number;
  watch: number;
  snapshotDate: string | null;
};