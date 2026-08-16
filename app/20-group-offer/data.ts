export const STORE_NAME = "Demo Motors";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const dashboardPace = {
  sold: 87,
  closed: 64,
  goal: 150,
  pace: 148,
  projVsGoal: -2,
  vsPace: 16,
  pending: 12,
  workingDaysUsed: 10,
  workingDaysTotal: 21,
  remaining: 11,
  month: 8,
  year: 2026,
  monthLabel: "August 2026",
  needPerDay: "5.7",
  toGo: 63,
  paceLineToday: 71,
  front: 118400,
  back: 121900,
  gross: 240300,
  clock: "2:14 PM",
} as const;

export type DashboardDeptCard = {
  name: string;
  sold: number;
  pace: number;
  goal: number;
  projVsGoal: number;
  vsPace: number;
  pending: number;
  needPerDay: string;
  toGo: number;
  paceLineToday: number;
  front: number;
  back: number;
  total: number;
  avgFront: number;
  avgBack: number;
  avgTotal: number;
  financeLine: string;
  sources: { name: string; value: string; width: number }[];
};

export const departmentCards: DashboardDeptCard[] = [
  {
    name: "Pre-Owned",
    sold: 49,
    pace: 103,
    goal: 100,
    projVsGoal: 3,
    vsPace: 1,
    pending: 8,
    needPerDay: "4.6",
    toGo: 51,
    paceLineToday: 48,
    front: 72800,
    back: 89400,
    total: 162200,
    avgFront: 1916,
    avgBack: 2353,
    avgTotal: 4268,
    financeLine: "FIN Prime 44% · Subprime 31% · Cash 17% · Lease 8%",
    sources: [
      { name: "Auction", value: "22", width: 100 },
      { name: "Trade-In", value: "18", width: 82 },
      { name: "Dealer Trade", value: "9", width: 41 },
    ],
  },
  {
    name: "New",
    sold: 23,
    pace: 48,
    goal: 50,
    projVsGoal: -2,
    vsPace: -1,
    pending: 3,
    needPerDay: "2.5",
    toGo: 27,
    paceLineToday: 24,
    front: 31100,
    back: 21200,
    total: 52300,
    avgFront: 1829,
    avgBack: 1247,
    avgTotal: 3076,
    financeLine: "FIN Prime 52% · Subprime 19% · Cash 11% · Lease 18%",
    sources: [
      { name: "Factory", value: "16", width: 100 },
      { name: "Dealer Trade", value: "5", width: 31 },
      { name: "Allocation", value: "2", width: 13 },
    ],
  },
  {
    name: "Fleet",
    sold: 15,
    pace: 32,
    goal: 30,
    projVsGoal: 2,
    vsPace: 1,
    pending: 1,
    needPerDay: "1.4",
    toGo: 15,
    paceLineToday: 14,
    front: 14500,
    back: 11300,
    total: 25800,
    avgFront: 1611,
    avgBack: 1256,
    avgTotal: 2867,
    financeLine: "FIN Prime 38% · Subprime 8% · Cash 41% · Lease 13%",
    sources: [
      { name: "Fleet", value: "11", width: 100 },
      { name: "Auction", value: "3", width: 27 },
      { name: "Trade-In", value: "1", width: 9 },
    ],
  },
];

export type DealStatus = "pending" | "delivered" | "closed";

export type RegistryDeal = {
  stock: string;
  vehicle: string;
  department: string;
  salesperson: string;
  source: string;
  status: DealStatus;
  front: string;
  back: string;
  total: string;
};

export const registryDeals: RegistryDeal[] = [
  {
    stock: "D2608012",
    vehicle: "2023 Silverado 1500 LT",
    department: "Pre-Owned",
    salesperson: "Jordan Blake",
    source: "Auction",
    status: "closed",
    front: "$1,420",
    back: "$3,120",
    total: "$4,540",
  },
  {
    stock: "D2608018",
    vehicle: "2022 Equinox LT",
    department: "Pre-Owned",
    salesperson: "Maya Thompson",
    source: "Trade-In",
    status: "delivered",
    front: "$890",
    back: "$2,410",
    total: "$3,300",
  },
  {
    stock: "D2608021",
    vehicle: "2021 F-150 XLT",
    department: "Pre-Owned",
    salesperson: "Priya Patel",
    source: "Auction",
    status: "closed",
    front: "$1,180",
    back: "$2,680",
    total: "$3,860",
  },
  {
    stock: "N2608007",
    vehicle: "2026 Silverado 1500 RST",
    department: "New",
    salesperson: "Jordan Blake",
    source: "Factory",
    status: "pending",
    front: "$2,100",
    back: "$1,890",
    total: "$3,990",
  },
  {
    stock: "D2608004",
    vehicle: "2019 Camry LE",
    department: "Pre-Owned",
    salesperson: "Ethan Brooks",
    source: "Auction",
    status: "closed",
    front: "$420",
    back: "$980",
    total: "$1,400",
  },
  {
    stock: "D2608015",
    vehicle: "2020 Grand Cherokee Laredo",
    department: "Pre-Owned",
    salesperson: "Sofia Ramirez",
    source: "Dealer Trade",
    status: "delivered",
    front: "$1,680",
    back: "$2,010",
    total: "$3,690",
  },
  {
    stock: "D2608024",
    vehicle: "2018 Altima SV",
    department: "Pre-Owned",
    salesperson: "Chris Ortega",
    source: "Auction",
    status: "pending",
    front: "$280",
    back: "$640",
    total: "$920",
  },
  {
    stock: "D2608009",
    vehicle: "2022 Traverse LT",
    department: "Pre-Owned",
    salesperson: "Ava Nguyen",
    source: "Trade-In",
    status: "closed",
    front: "$1,540",
    back: "$2,760",
    total: "$4,300",
  },
];

export type ProfitSignal = "BUY MORE" | "WATCH" | "RED-LIGHT";

export type ProfitRow = {
  model: string;
  units: number;
  front: string;
  back: string;
  total: string;
  days: number;
  tradePct: string;
  signal: ProfitSignal;
  takeaway: string;
};

export const profitRows: ProfitRow[] = [
  {
    model: "Silverado 1500",
    units: 22,
    front: "$1,450",
    back: "$2,890",
    total: "$4,340",
    days: 24,
    tradePct: "41%",
    signal: "BUY MORE",
    takeaway:
      "Low front, huge back, fast turn, 4 in 10 bring a trade — this is the car the lane price hides.",
  },
  {
    model: "F-150",
    units: 18,
    front: "$1,180",
    back: "$2,640",
    total: "$3,820",
    days: 28,
    tradePct: "38%",
    signal: "BUY MORE",
    takeaway:
      "Same story as the Chevy — back carries the deal, under 30 days, trades keep showing up.",
  },
  {
    model: "Equinox",
    units: 15,
    front: "$890",
    back: "$2,310",
    total: "$3,200",
    days: 26,
    tradePct: "33%",
    signal: "BUY MORE",
    takeaway: "Volume unit. Modest front, solid back, 26-day turn. Restock these.",
  },
  {
    model: "Grand Cherokee",
    units: 12,
    front: "$1,720",
    back: "$1,980",
    total: "$3,700",
    days: 44,
    tradePct: "22%",
    signal: "WATCH",
    takeaway:
      "Front looks tasty until you sit 44 days and the trade percentage drops. Don't chase them.",
  },
  {
    model: "Camry",
    units: 10,
    front: "$640",
    back: "$1,450",
    total: "$2,090",
    days: 51,
    tradePct: "18%",
    signal: "WATCH",
    takeaway:
      "They look safe in the lane. Fifty-one days and a thin back says the lot fills up with them.",
  },
  {
    model: "Altima",
    units: 9,
    front: "$310",
    back: "$980",
    total: "$1,290",
    days: 72,
    tradePct: "11%",
    signal: "RED-LIGHT",
    takeaway: "Eleven percent trade, 72 days, barely a back. Leave them in the lane.",
  },
  {
    model: "Cruze",
    units: 7,
    front: "$180",
    back: "$760",
    total: "$940",
    days: 84,
    tradePct: "8%",
    signal: "RED-LIGHT",
    takeaway: "Looked cheap in the lane. $940 total and 84 days says stop buying them.",
  },
];

export type HotListAction = "Price move" | "Auction run" | "Transfer";

export type HotListUnit = {
  stock: string;
  vehicle: string;
  days: number;
  willBe90: boolean;
  owner: string;
  action: HotListAction;
};

export const hotListUnits: HotListUnit[] = [
  {
    stock: "D2505218",
    vehicle: "2018 Cruze LS",
    days: 86,
    willBe90: true,
    owner: "Maya Thompson",
    action: "Auction run",
  },
  {
    stock: "D2506112",
    vehicle: "2019 Malibu LT",
    days: 78,
    willBe90: true,
    owner: "Derek Collins",
    action: "Price move",
  },
  {
    stock: "D2504901",
    vehicle: "2017 Equinox LS",
    days: 84,
    willBe90: true,
    owner: "Priya Patel",
    action: "Auction run",
  },
  {
    stock: "D2507180",
    vehicle: "2020 Traverse LT",
    days: 61,
    willBe90: false,
    owner: "Jordan Blake",
    action: "Price move",
  },
  {
    stock: "D2506304",
    vehicle: "2021 Camry SE",
    days: 54,
    willBe90: false,
    owner: "Ethan Brooks",
    action: "Transfer",
  },
];

export const inventoryChips = [
  { label: "Photos missing", value: "6" },
  { label: "Over time-to-line", value: "3" },
  { label: "Price actions this week", value: "11" },
] as const;

export const faqItems = [
  {
    q: "Does it replace vAuto?",
    a: "No. vAuto prices the car you own. This tells you whether you should have bought it — it's the layer after vAuto.",
  },
  {
    q: "Who sees my numbers?",
    a: "You and your people. Every group's data is isolated. Nothing is pooled, benchmarked, or shared — including with other members of this group.",
  },
  {
    q: "How much work for my managers?",
    a: "About two minutes per deal at entry; the full jacket at close, which they're already assembling anyway.",
  },
  {
    q: "What does it cost?",
    a: "Signing up is free for 20 Group dealers. Dylan will reach out personally to walk you through everything else.",
  },
] as const;
