"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MONTH_NAMES,
  fmtCurrency,
  fmtUnits,
} from "@/lib/dashboard/pace";

type Store = { id: string; name: string };
type Deal = {
  id: string;
  status: string;
  front_profit: number | null;
  back_profit: number | null;
  store_id: string;
  sale_date: string;
};
type Salesperson = { id: string; name: string; store_id: string };
type DealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

type Props = {
  stores: Store[];
  deals: Deal[];
  salespeople: Salesperson[];
  dealSalespeople: DealSalesperson[];
  year: number;
  month: number;
  isCurrentMonth: boolean;
  currentYear: number;
  currentMonth: number;
};

function isBooked(status: string) {
  return status === "pending" || status === "delivered" || status === "closed";
}

function isClosed(status: string) {
  return status === "closed";
}

function saleMonth(saleDate: string): { year: number; month: number } {
  const d = saleDate.slice(0, 10);
  return {
    year: parseInt(d.slice(0, 4), 10),
    month: parseInt(d.slice(5, 7), 10),
  };
}

export default function LeaderboardClient({
  stores,
  deals,
  salespeople,
  dealSalespeople,
  year,
  month,
  isCurrentMonth,
  currentYear,
  currentMonth,
}: Props) {
  const router = useRouter();
  const [selectedStore, setSelectedStore] = useState<"all" | string>(
    stores.length === 1 ? stores[0].id : "all"
  );
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    if (stores.length === 1) setSelectedStore(stores[0].id);
  }, [stores]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      router.refresh();
      setUpdatedAt(new Date());
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [router]);

  function navigateMonth(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams();
    const ctMatch = nextYear === currentYear && nextMonth === currentMonth;
    if (!ctMatch) {
      params.set("year", String(nextYear));
      params.set("month", String(nextMonth));
    }
    const q = params.toString();
    router.push(
      q ? `/app/salesperson-leaderboard?${q}` : "/app/salesperson-leaderboard"
    );
  }

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);
    if (!years.includes(year)) years.push(year);
    return years.sort((a, b) => b - a);
  }, [currentYear, year]);

  const { monthLabel, leaderboard, showStoreCol } = useMemo(() => {
    const selectedStoreIds =
      selectedStore === "all" ? stores.map((s) => s.id) : [selectedStore];
    const showStoreCol = selectedStore === "all" && stores.length > 1;
    const storeById = new Map(stores.map((s) => [s.id, s.name]));

    const mtdDeals = deals.filter((d) => {
      if (!selectedStoreIds.includes(d.store_id)) return false;
      const sm = saleMonth(d.sale_date);
      return sm.year === year && sm.month === month;
    });
    const ytdDeals = deals.filter((d) =>
      selectedStoreIds.includes(d.store_id)
    );

    const mtdDealMap = new Map(mtdDeals.map((d) => [d.id, d]));
    const ytdDealMap = new Map(ytdDeals.map((d) => [d.id, d]));
    const spAcc = new Map<
      string,
      {
        mtdUnits: number;
        ytdUnits: number;
        closedUnits: number;
        front: number;
        back: number;
      }
    >();

    for (const ds of dealSalespeople) {
      const share = (ds.share_percent ?? 0) / 100;
      if (share <= 0) continue;

      const mtdDeal = mtdDealMap.get(ds.deal_id);
      const ytdDeal = ytdDealMap.get(ds.deal_id);
      if (!mtdDeal && !ytdDeal) continue;

      const acc = spAcc.get(ds.salesperson_id) ?? {
        mtdUnits: 0,
        ytdUnits: 0,
        closedUnits: 0,
        front: 0,
        back: 0,
      };

      if (ytdDeal && isBooked(ytdDeal.status)) {
        acc.ytdUnits += share;
      }
      if (mtdDeal && isBooked(mtdDeal.status)) {
        acc.mtdUnits += share;
        if (isClosed(mtdDeal.status)) {
          acc.closedUnits += share;
          acc.front += (mtdDeal.front_profit ?? 0) * share;
          acc.back += (mtdDeal.back_profit ?? 0) * share;
        }
      }
      spAcc.set(ds.salesperson_id, acc);
    }

    const spById = new Map(salespeople.map((sp) => [sp.id, sp]));
    const leaderboard = Array.from(spAcc.entries())
      .map(([spId, acc]) => {
        const sp = spById.get(spId);
        const total = acc.front + acc.back;
        return {
          id: spId,
          name: sp?.name ?? "Unknown",
          storeName: storeById.get(sp?.store_id ?? "") ?? "",
          mtdUnits: acc.mtdUnits,
          ytdUnits: acc.ytdUnits,
          front: acc.front,
          back: acc.back,
          total,
          avgGross: acc.closedUnits > 0 ? total / acc.closedUnits : null,
        };
      })
      .filter((r) => r.mtdUnits > 0)
      .sort(
        (a, b) =>
          b.mtdUnits - a.mtdUnits ||
          b.total - a.total ||
          a.name.localeCompare(b.name)
      );

    return {
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      leaderboard,
      showStoreCol,
    };
  }, [
    selectedStore,
    stores,
    deals,
    salespeople,
    dealSalespeople,
    year,
    month,
  ]);

  const top3 = leaderboard.slice(0, 3);
  const updatedLabel = updatedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={cn("pc-command dash-tv space-y-5")}>
      <header className="pc-head dash-tv-head">
        <div>
          <p className="pc-kicker">Sales leaderboard</p>
          <h1 className="pc-title">{monthLabel}</h1>
          <p className="pc-meta">
            Combined volume and gross across all departments · Live · refreshed{" "}
            {updatedLabel}
          </p>
        </div>

        <div className="dash-tv-controls">
          <div className="dash-tv-selects">
            <label>
              <span>Month</span>
              <select
                value={month}
                onChange={(e) =>
                  navigateMonth(year, parseInt(e.target.value, 10))
                }
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Year</span>
              <select
                value={year}
                onChange={(e) =>
                  navigateMonth(parseInt(e.target.value, 10), month)
                }
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={cn("pc-pill is-soft", isCurrentMonth && "is-active")}
              onClick={() => navigateMonth(currentYear, currentMonth)}
            >
              Current Month
            </button>
          </div>

          {stores.length > 0 && (
            <div className="pc-store-pills" role="group" aria-label="Store">
              <button
                type="button"
                className={cn("pc-pill", selectedStore === "all" && "is-active")}
                onClick={() => setSelectedStore("all")}
              >
                ALL
              </button>
              {stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  className={cn(
                    "pc-pill",
                    selectedStore === store.id && "is-active"
                  )}
                  onClick={() => setSelectedStore(store.id)}
                >
                  {store.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="da-demo-podium dash-tv-podium">
        <div className="da-demo-section-title">
          <span className="da-sec-eyebrow">Sales leaderboard</span>
          <h2>Who&apos;s leading the board this month</h2>
          <p>
            Top names stay visible for the whole store — MTD units, gross, and
            YTD pace.
          </p>
        </div>

        {top3.length > 0 ? (
          <div className="da-demo-podium-grid">
            {top3.map((p, idx) => (
              <div
                key={p.id}
                className={`da-demo-podium-card rank-${idx + 1}`}
              >
                <div className="da-demo-rank">#{idx + 1}</div>
                <div className="da-demo-podium-name">{p.name}</div>
                <div className="da-demo-podium-store">
                  {p.storeName || "—"}
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtUnits(p.mtdUnits)}</b>
                  <span>MTD units</span>
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtCurrency(p.total)}</b>
                  <span>MTD gross</span>
                </div>
                <div className="da-demo-podium-stat">
                  <b>{fmtUnits(p.ytdUnits)}</b>
                  <span>YTD units</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pc-panel">
            <p className="dash-tv-empty">No salesperson volume this month.</p>
          </div>
        )}
      </section>

      <div className="da-demo-panel">
        <div className="da-demo-panel-head">
          <h3>Full salesperson leaderboard</h3>
          <span>Sorted by MTD units</span>
        </div>
        <div className="da-demo-table-scroll">
          <table className="da-demo-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Salesperson</th>
                {showStoreCol && <th>Store</th>}
                <th className="r">MTD Units</th>
                <th className="r">YTD Units</th>
                <th className="r">Front</th>
                <th className="r">Back</th>
                <th className="r">Total Gross</th>
                <th className="r">Avg / Deal</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td
                    colSpan={showStoreCol ? 9 : 8}
                    className="dash-tv-empty-cell"
                  >
                    No deals logged for this view.
                  </td>
                </tr>
              ) : (
                leaderboard.map((row, i) => (
                  <tr key={row.id} className={i < 3 ? "is-hot" : undefined}>
                    <td>
                      <span
                        className={`da-demo-rank-pill${i < 3 ? " top" : ""}`}
                      >
                        #{i + 1}
                      </span>
                    </td>
                    <td className="strong">{row.name}</td>
                    {showStoreCol && <td>{row.storeName}</td>}
                    <td className="r">{fmtUnits(row.mtdUnits)}</td>
                    <td className="r">{fmtUnits(row.ytdUnits)}</td>
                    <td className="r">{fmtCurrency(row.front)}</td>
                    <td className="r">{fmtCurrency(row.back)}</td>
                    <td className="r strong">{fmtCurrency(row.total)}</td>
                    <td className="r">
                      {row.avgGross !== null ? fmtCurrency(row.avgGross) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="dash-tv-footnote">
          Gross and average / deal use closed deals only. Units include pending,
          delivered, and closed (booked).
        </p>
      </div>
    </div>
  );
}
