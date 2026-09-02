export type TradeDeal = {
  id: string;
  sale_date: string;
  store_id: string;
  department_id: string | null;
};

export type TradeRow = {
  id: string;
  deal_id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  acv: number | null;
  allowance: number | null;
  exit_strategy: string | null;
};

export type TradeDealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

export type ExitBucket = "retail" | "wholesale" | "unknown";

export type TradesBundle = {
  deals: TradeDeal[];
  trades: TradeRow[];
  dealSalespeople: TradeDealSalesperson[];
};
