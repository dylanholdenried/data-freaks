/**
 * Deterministic ACQ Auto Group demo fixture for the public /demo experience.
 * Generated entirely in-process — no Supabase / service-role dependency.
 */

export type DemoStore = {
  id: string;
  name: string;
  brand: "Chevrolet" | "Kia";
};

export type DemoDepartment = {
  id: string;
  store_id: string;
  name: string;
  is_new: boolean;
};

export type DemoSalesperson = {
  id: string;
  store_id: string;
  name: string;
};

export type DemoFinanceManager = {
  id: string;
  store_id: string;
  name: string;
};

export type DemoDealStatus = "pending" | "delivered" | "closed" | "dead" | "unwound";

export type DemoDeal = {
  id: string;
  store_id: string;
  department_id: string;
  sale_date: string;
  stock_number: string;
  vin: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  body_style: string;
  status: DemoDealStatus;
  front_profit: number;
  back_profit: number;
  sale_price: number;
  list_price: number;
  list_price_na: boolean;
  age: number;
  acquisition_source: string;
  finance_type: "Prime" | "Subprime" | "Cash" | "Lease";
  finance_manager_id: string;
  has_trade: boolean;
  trade_acv: number | null;
  trade_allowance: number | null;
};

export type DemoDealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

export type DemoFixture = {
  groupName: string;
  year: number;
  stores: DemoStore[];
  departments: DemoDepartment[];
  salespeople: DemoSalesperson[];
  financeManagers: DemoFinanceManager[];
  deals: DemoDeal[];
  dealSalespeople: DemoDealSalesperson[];
};

type VehicleSpec = {
  model: string;
  body: string;
  price: [number, number];
  front: [number, number];
  age?: [number, number];
};

const CHEVY_NEW: VehicleSpec[] = [
  { model: "Silverado 1500", body: "Truck", price: [42000, 62000], front: [1800, 5200] },
  { model: "Equinox", body: "SUV", price: [28000, 38000], front: [900, 3200] },
  { model: "Traverse", body: "SUV", price: [34000, 48000], front: [1200, 3800] },
  { model: "Malibu", body: "Sedan", price: [23000, 31000], front: [400, 1800] },
  { model: "Tahoe", body: "SUV", price: [56000, 78000], front: [2200, 5800] },
  { model: "Blazer", body: "SUV", price: [36000, 49000], front: [1100, 3400] },
  { model: "Colorado", body: "Truck", price: [32000, 46000], front: [1400, 4200] },
  { model: "Trax", body: "SUV", price: [21000, 28000], front: [500, 2000] },
];

const CHEVY_USED: VehicleSpec[] = [
  { model: "Silverado 1500", body: "Truck", price: [18000, 38000], front: [1200, 4800], age: [8, 55] },
  { model: "Equinox", body: "SUV", price: [12000, 24000], front: [800, 3200], age: [12, 70] },
  { model: "Malibu", body: "Sedan", price: [8000, 16000], front: [-400, 1600], age: [25, 95] },
  { model: "Traverse", body: "SUV", price: [14000, 28000], front: [700, 3000], age: [15, 65] },
  { model: "Cruze", body: "Sedan", price: [6000, 12000], front: [-800, 900], age: [40, 110] },
  { model: "Tahoe", body: "SUV", price: [28000, 48000], front: [1500, 4500], age: [10, 50] },
  { model: "Colorado", body: "Truck", price: [16000, 30000], front: [900, 3600], age: [12, 60] },
  { model: "Impala", body: "Sedan", price: [7000, 14000], front: [-600, 1100], age: [35, 100] },
];

const KIA_NEW: VehicleSpec[] = [
  { model: "Telluride", body: "SUV", price: [38000, 52000], front: [1600, 4800] },
  { model: "Sportage", body: "SUV", price: [27000, 37000], front: [900, 3000] },
  { model: "Sorento", body: "SUV", price: [32000, 45000], front: [1100, 3600] },
  { model: "K5", body: "Sedan", price: [25000, 34000], front: [700, 2600] },
  { model: "Forte", body: "Sedan", price: [20000, 27000], front: [400, 1800] },
  { model: "Carnival", body: "Van", price: [36000, 48000], front: [1300, 4000] },
  { model: "Seltos", body: "SUV", price: [23000, 31000], front: [600, 2200] },
  { model: "EV6", body: "SUV", price: [44000, 58000], front: [1000, 3400] },
];

const KIA_USED: VehicleSpec[] = [
  { model: "Telluride", body: "SUV", price: [24000, 40000], front: [1400, 4200], age: [10, 50] },
  { model: "Sportage", body: "SUV", price: [12000, 24000], front: [700, 2800], age: [15, 70] },
  { model: "Sorento", body: "SUV", price: [14000, 28000], front: [800, 3000], age: [14, 65] },
  { model: "Optima", body: "Sedan", price: [7000, 14000], front: [-500, 1200], age: [30, 100] },
  { model: "Forte", body: "Sedan", price: [8000, 16000], front: [200, 1600], age: [20, 80] },
  { model: "Soul", body: "Hatch", price: [7000, 15000], front: [-300, 1400], age: [25, 90] },
  { model: "Carnival", body: "Van", price: [22000, 36000], front: [1000, 3400], age: [12, 55] },
  { model: "Rio", body: "Sedan", price: [5000, 11000], front: [-700, 800], age: [40, 110] },
];

const SOURCES = [
  "Auction",
  "Trade-In",
  "Private Party",
  "Fleet",
  "Dealer Trade",
  "Lease Return",
] as const;

const FINANCE_TYPES = ["Prime", "Subprime", "Cash", "Lease"] as const;

const CHEVY_SP = [
  "Marcus Hale",
  "Sofia Ramirez",
  "Derek Collins",
  "Ava Nguyen",
  "Jordan Blake",
  "Priya Patel",
  "Chris Ortega",
  "Maya Thompson",
  "Ethan Brooks",
  "Grace Kim",
];

const KIA_SP = [
  "Noah Park",
  "Elena Vasquez",
  "Liam Foster",
  "Chloe Bennett",
  "Ryan Okonkwo",
  "Isabella Cruz",
  "Tyler Grant",
  "Hannah Price",
  "Omar Hassan",
  "Zoe Mitchell",
  "Cameron Lee",
];

const CHEVY_FM = ["Diane Walsh", "Greg Stanton", "Nina Alvarez"];
const KIA_FM = ["Brett Holloway", "Carla Simmons", "Victor Reyes", "Amy Cho"];

/** Mulberry32 seeded PRNG */
function makeRng(seed: number) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(between(rng, min, max + 1));
}

function roundMoney(n: number): number {
  return Math.round(n);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0; // Sunday closed; Saturday open
}

function fakeVin(rng: () => number, index: number): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let vin = "1G";
  for (let i = 0; i < 15; i++) {
    vin += chars[Math.floor(rng() * chars.length)];
  }
  return vin.slice(0, 14) + String(index % 10) + String((index * 7) % 10);
}

function statusForDeal(rng: () => number, saleDate: string, today: string): DemoDealStatus {
  if (saleDate > today) return "pending";
  const r = rng();
  if (r < 0.04) return "dead";
  if (r < 0.07) return "unwound";
  if (r < 0.14) return "delivered";
  if (r < 0.2) return "pending";
  return "closed";
}

let cached: DemoFixture | null = null;

export function getAcqAutoGroupFixture(): DemoFixture {
  if (cached) return cached;

  const year = 2026;
  const rng = makeRng(20260729);
  // Freeze "today" in the demo so YTD/MTD stay deterministic across deploys.
  const today = "2026-07-29";

  const stores: DemoStore[] = [
    { id: "store-chevy", name: "ACQ Chevrolet", brand: "Chevrolet" },
    { id: "store-kia", name: "ACQ Kia", brand: "Kia" },
  ];

  const departments: DemoDepartment[] = [
    { id: "dept-chevy-new", store_id: "store-chevy", name: "New Chevrolet", is_new: true },
    { id: "dept-chevy-po", store_id: "store-chevy", name: "Pre-Owned", is_new: false },
    { id: "dept-kia-new", store_id: "store-kia", name: "New Kia", is_new: true },
    { id: "dept-kia-po", store_id: "store-kia", name: "Pre-Owned", is_new: false },
  ];

  const salespeople: DemoSalesperson[] = [
    ...CHEVY_SP.map((name, i) => ({
      id: `sp-chevy-${i + 1}`,
      store_id: "store-chevy",
      name,
    })),
    ...KIA_SP.map((name, i) => ({
      id: `sp-kia-${i + 1}`,
      store_id: "store-kia",
      name,
    })),
  ];

  const financeManagers: DemoFinanceManager[] = [
    ...CHEVY_FM.map((name, i) => ({
      id: `fm-chevy-${i + 1}`,
      store_id: "store-chevy",
      name,
    })),
    ...KIA_FM.map((name, i) => ({
      id: `fm-kia-${i + 1}`,
      store_id: "store-kia",
      name,
    })),
  ];

  const deals: DemoDeal[] = [];
  const dealSalespeople: DemoDealSalesperson[] = [];
  let dealSeq = 0;

  for (const store of stores) {
    const storeDepts = departments.filter((d) => d.store_id === store.id);
    const newDept = storeDepts.find((d) => d.is_new)!;
    const usedDept = storeDepts.find((d) => !d.is_new)!;
    const storeSp = salespeople.filter((s) => s.store_id === store.id);
    const storeFm = financeManagers.filter((f) => f.store_id === store.id);
    const newCatalog = store.brand === "Chevrolet" ? CHEVY_NEW : KIA_NEW;
    const usedCatalog = store.brand === "Chevrolet" ? CHEVY_USED : KIA_USED;

    for (let month = 1; month <= 12; month++) {
      // ~150 deals/month with slight seasonal variation
      const base = 148 + intBetween(rng, -8, 12);
      const seasonal =
        month === 3 || month === 4 || month === 9 || month === 10
          ? intBetween(rng, 4, 10)
          : month === 12 || month === 1
            ? intBetween(rng, -6, 2)
            : 0;
      const monthCount = Math.max(130, base + seasonal);
      const dim = daysInMonth(year, month);

      for (let i = 0; i < monthCount; i++) {
        dealSeq += 1;
        let day = intBetween(rng, 1, dim);
        // Bias away from Sundays
        if (isWeekend(year, month, day) && rng() < 0.7) {
          day = Math.min(dim, day + 1);
        }
        const sale_date = `${year}-${pad(month)}-${pad(day)}`;

        const isNew = rng() < 0.56; // slight new majority
        const dept = isNew ? newDept : usedDept;
        const vehicle = isNew ? pick(rng, newCatalog) : pick(rng, usedCatalog);
        const sale_price = roundMoney(between(rng, vehicle.price[0], vehicle.price[1]));
        let front = roundMoney(between(rng, vehicle.front[0], vehicle.front[1]));
        // Occasional red-light dogs on used
        if (!isNew && rng() < 0.12) {
          front = roundMoney(between(rng, -1200, 400));
        }
        const finance_type = pick(rng, FINANCE_TYPES);
        let back = 0;
        if (finance_type === "Cash") {
          back = roundMoney(between(rng, 0, 400));
        } else if (finance_type === "Lease") {
          back = roundMoney(between(rng, 800, 2200));
        } else if (finance_type === "Subprime") {
          back = roundMoney(between(rng, 1800, 4200));
        } else {
          back = roundMoney(between(rng, 1200, 3400));
        }

        const list_price = roundMoney(sale_price + between(rng, -800, 2200));
        const age = isNew
          ? intBetween(rng, 0, 45)
          : intBetween(rng, vehicle.age?.[0] ?? 10, vehicle.age?.[1] ?? 70);

        const acquisition_source = isNew
          ? pick(rng, ["Factory", "Dealer Trade", "Allocation"] as const)
          : pick(rng, SOURCES);

        const has_trade = rng() < 0.42;
        const trade_acv = has_trade ? roundMoney(between(rng, 2000, 18000)) : null;
        const trade_allowance = has_trade
          ? roundMoney((trade_acv ?? 0) + between(rng, -800, 1500))
          : null;

        const status = statusForDeal(rng, sale_date, today);
        // Pending/dead often have zeroed back until delivered
        const front_profit = status === "dead" ? 0 : front;
        const back_profit =
          status === "dead" || status === "pending" ? (status === "pending" ? 0 : 0) : back;

        const id = `deal-${pad(dealSeq, 5)}`;
        const stock_number = `${store.brand === "Chevrolet" ? "C" : "K"}${year.toString().slice(2)}${pad(month)}${pad(i + 1, 3)}`;

        deals.push({
          id,
          store_id: store.id,
          department_id: dept.id,
          sale_date,
          stock_number,
          vin: fakeVin(rng, dealSeq),
          vehicle_year: isNew ? year : intBetween(rng, year - 10, year - 1),
          vehicle_make: store.brand,
          vehicle_model: vehicle.model,
          body_style: vehicle.body,
          status,
          front_profit: front_profit,
          back_profit: back_profit,
          sale_price,
          list_price,
          list_price_na: false,
          age,
          acquisition_source,
          finance_type,
          finance_manager_id: pick(rng, storeFm).id,
          has_trade,
          trade_acv,
          trade_allowance,
        });

        // Occasional split deals
        if (rng() < 0.12) {
          const a = pick(rng, storeSp);
          let b = pick(rng, storeSp);
          let guard = 0;
          while (b.id === a.id && guard++ < 8) b = pick(rng, storeSp);
          if (b.id !== a.id) {
            dealSalespeople.push(
              { deal_id: id, salesperson_id: a.id, share_percent: 50 },
              { deal_id: id, salesperson_id: b.id, share_percent: 50 }
            );
          } else {
            dealSalespeople.push({ deal_id: id, salesperson_id: a.id, share_percent: 100 });
          }
        } else {
          dealSalespeople.push({
            deal_id: id,
            salesperson_id: pick(rng, storeSp).id,
            share_percent: 100,
          });
        }
      }
    }
  }

  cached = {
    groupName: "ACQ Auto Group",
    year,
    stores,
    departments,
    salespeople,
    financeManagers,
    deals,
    dealSalespeople,
  };
  return cached;
}

export const DEMO_TODAY = "2026-07-29";

export function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function integer(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
