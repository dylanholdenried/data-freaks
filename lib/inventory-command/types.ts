export type InvDisposition = "retail" | "subprime";

export type InvUnitRow = {
  stk: string;
  veh: string | null;
  body: string | null;
  age: number | null;
  ph: number | null;
  cost: number | null;
  price: number | null;
  pom: number | null;
  dsr: number | null;
  srp: number | null;
  vdp: number | null;
  vr: number | null;
  mmr: number | null;
  jd: number | null;
  pt: string | null;
  disp: InvDisposition;
  d_vdp: number | null;
  d_srp: number | null;
  d_p: number | null;
  d_ph: number | null;
};

export type InvDailyMetrics = {
  store_id: string;
  snapshot_date: string;
  units: number;
  avg_age: number | null;
  over60: number;
  over90: number;
  full_photos: number;
  no_ph: number;
  stale: number;
  no_price: number;
  hot: number;
  hot_cost: number;
  ttl_fail: number | null;
  retail_count: number;
  subprime_count: number;
};

export type InvMovement = {
  store_id: string;
  movement_date: string;
  type: "arrive" | "exit";
  stk: string;
  veh: string | null;
  age: number | null;
  cost: number | null;
};

export type InvPriceAction = {
  store_id: string;
  action_date: string;
  stk: string;
  veh: string | null;
  age: number | null;
  type: "cut" | "raise";
  price: number | null;
  d_p: number | null;
};

export type InventoryCommandTab =
  | "overview"
  | "dh"
  | "trends"
  | "hot"
  | "merchandising"
  | "pricing"
  | "demand"
  | "mix"
  | "subprime";
