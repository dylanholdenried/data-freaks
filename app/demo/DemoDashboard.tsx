"use client";

import { useMemo } from "react";
import {
  currency,
  DEMO_TODAY,
  integer,
  type DemoFixture,
} from "@/lib/demo/acq-auto-group";

type Props = {
  fixture: DemoFixture;
  storeId: string;
  month: number;
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function isBooked(status: string) {
  return status === "pending" || status === "delivered" || status === "closed";
}

function isClosed(status: string) {
  return status === "closed" || status === "delivered";
}

export function DemoDashboard({ fixture, storeId, month }: Props) {
  const selectedStoreIds =
    storeId === "all" ? fixture.stores.map((s) => s.id) : [storeId];

  const monthPrefix = `2026-${String(month).padStart(2, "0")}`;
  const ytdPrefixEnd = monthPrefix;

  const monthDeals = useMemo(
    () =>
      fixture.deals.filter(
        (d) =>
          selectedStoreIds.includes(d.store_id) && monthKey(d.sale_date) === monthPrefix
      ),
    [fixture.deals, selectedStoreIds, monthPrefix]
  );

  const ytdDeals = useMemo(
    () =>
      fixture.deals.filter(
        (d) =>
          selectedStoreIds.includes(d.store_id) &&
          d.sale_date.startsWith("2026-") &&
          monthKey(d.sale_date) <= ytdPrefixEnd
      ),
    [fixture.deals, selectedStoreIds, ytdPrefixEnd]
  );

  const booked = monthDeals.filter((d) => isBooked(d.status));
  const closed = monthDeals.filter((d) => isClosed(d.status));
  const front = closed.reduce((s, d) => s + d.front_profit, 0);
  const back = closed.reduce((s, d) => s + d.back_profit, 0);
  const totalGross = front + back;
  const newUnits = booked.filter((d) =>
    fixture.departments.find((dep) => dep.id === d.department_id)?.is_new
  ).length;
  const usedUnits = booked.length - newUnits;
  const financeDeals = closed.filter((d) => d.finance_type !== "Cash").length;
  const tradeDeals = closed.filter((d) => d.has_trade).length;

  const workingDaysInMonth = 26;
  const todayParts = DEMO_TODAY.split("-").map(Number);
  const completedDays =
    todayParts[0] === 2026 && todayParts[1] === month
      ? Math.min(workingDaysInMonth, Math.max(1, todayParts[2] - Math.floor(todayParts[2] / 7)))
      : month < 7
        ? workingDaysInMonth
        : month > 7
          ? 0
          : workingDaysInMonth;
  const pace =
    completedDays > 0 ? (booked.length / completedDays) * workingDaysInMonth : booked.length;

  const deptRows = useMemo(() => {
    const depts = fixture.departments.filter((d) => selectedStoreIds.includes(d.store_id));
    return depts
      .map((dept) => {
        const rows = booked.filter((d) => d.department_id === dept.id);
        const closedRows = closed.filter((d) => d.department_id === dept.id);
        const gross = closedRows.reduce((s, d) => s + d.front_profit + d.back_profit, 0);
        const goal = dept.is_new ? 80 : 70;
        return {
          id: dept.id,
          name: dept.name,
          store: fixture.stores.find((s) => s.id === dept.store_id)?.name ?? "",
          booked: rows.length,
          closed: closedRows.length,
          gross,
          goal,
          pace: completedDays > 0 ? (rows.length / completedDays) * workingDaysInMonth : rows.length,
        };
      })
      .sort((a, b) => b.booked - a.booked);
  }, [fixture, selectedStoreIds, booked, closed, completedDays]);

  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const prefix = `2026-${String(m).padStart(2, "0")}`;
      const rows = fixture.deals.filter(
        (d) => selectedStoreIds.includes(d.store_id) && monthKey(d.sale_date) === prefix
      );
      const closedRows = rows.filter((d) => isClosed(d.status));
      return {
        month: m,
        label: new Date(2026, i, 1).toLocaleString("en-US", { month: "short" }),
        units: rows.filter((d) => isBooked(d.status)).length,
        gross: closedRows.reduce((s, d) => s + d.front_profit + d.back_profit, 0),
      };
    });
  }, [fixture.deals, selectedStoreIds]);

  const maxUnits = Math.max(...monthlyTrend.map((m) => m.units), 1);
  const maxGross = Math.max(...monthlyTrend.map((m) => m.gross), 1);

  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of closed) {
      map.set(d.acquisition_source, (map.get(d.acquisition_source) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [closed]);

  const financeMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of closed) {
      map.set(d.finance_type, (map.get(d.finance_type) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [closed]);

  const leaderboard = useMemo(() => {
    const sp = fixture.salespeople.filter((s) => selectedStoreIds.includes(s.store_id));
    const dealMap = new Map(fixture.deals.map((d) => [d.id, d]));

    return sp
      .map((person) => {
        const assigns = fixture.dealSalespeople.filter((a) => a.salesperson_id === person.id);
        let mtdUnits = 0;
        let ytdUnits = 0;
        let mtdFront = 0;
        let mtdBack = 0;
        let ytdFront = 0;
        let ytdBack = 0;

        for (const a of assigns) {
          const deal = dealMap.get(a.deal_id);
          if (!deal || !selectedStoreIds.includes(deal.store_id)) continue;
          if (!isClosed(deal.status)) continue;
          const share = a.share_percent / 100;
          const mk = monthKey(deal.sale_date);
          if (mk.startsWith("2026-") && mk <= ytdPrefixEnd) {
            ytdUnits += share;
            ytdFront += deal.front_profit * share;
            ytdBack += deal.back_profit * share;
          }
          if (mk === monthPrefix) {
            mtdUnits += share;
            mtdFront += deal.front_profit * share;
            mtdBack += deal.back_profit * share;
          }
        }

        const mtdTotal = mtdFront + mtdBack;
        return {
          id: person.id,
          name: person.name,
          store: fixture.stores.find((s) => s.id === person.store_id)?.name ?? "",
          mtdUnits,
          ytdUnits,
          mtdFront,
          mtdBack,
          mtdTotal,
          avgGross: mtdUnits > 0 ? mtdTotal / mtdUnits : 0,
        };
      })
      .sort((a, b) => b.mtdUnits - a.mtdUnits || b.mtdTotal - a.mtdTotal);
  }, [fixture, selectedStoreIds, monthPrefix, ytdPrefixEnd]);

  const top3 = leaderboard.slice(0, 3);
  const sourceMax = Math.max(...sourceMix.map((s) => s.count), 1);

  return (
    <div className="da-demo-view">
      <div className="da-demo-kpi-grid">
        <Kpi label="Booked Units" value={integer(booked.length)} sub={`${integer(pace)} pace`} />
        <Kpi label="Closed Units" value={integer(closed.length)} sub="Delivered + closed" />
        <Kpi label="Total Gross" value={currency(totalGross)} accent sub={`${currency(front)} front`} />
        <Kpi
          label="Avg Gross / Deal"
          value={currency(closed.length ? totalGross / closed.length : 0)}
          sub={`${currency(back)} back total`}
        />
        <Kpi
          label="New / Used"
          value={`${newUnits} / ${usedUnits}`}
          sub={`${booked.length ? Math.round((newUnits / booked.length) * 100) : 0}% new`}
        />
        <Kpi
          label="Finance Penetration"
          value={`${closed.length ? Math.round((financeDeals / closed.length) * 100) : 0}%`}
          blue
          sub={`${closed.length ? Math.round((tradeDeals / closed.length) * 100) : 0}% with trade`}
        />
      </div>

      <div className="da-demo-podium">
        <div className="da-demo-section-title">
          <span className="da-sec-eyebrow">Sales leaderboard</span>
          <h2>Who&apos;s leading the board this month</h2>
          <p>Top names stay visible for the whole store — MTD units, gross, and YTD pace.</p>
        </div>
        <div className="da-demo-podium-grid">
          {top3.map((p, idx) => (
            <div key={p.id} className={`da-demo-podium-card rank-${idx + 1}`}>
              <div className="da-demo-rank">#{idx + 1}</div>
              <div className="da-demo-podium-name">{p.name}</div>
              <div className="da-demo-podium-store">{p.store}</div>
              <div className="da-demo-podium-stat">
                <b>{p.mtdUnits.toFixed(1)}</b>
                <span>MTD units</span>
              </div>
              <div className="da-demo-podium-stat">
                <b>{currency(p.mtdTotal)}</b>
                <span>MTD gross</span>
              </div>
              <div className="da-demo-podium-stat">
                <b>{p.ytdUnits.toFixed(1)}</b>
                <span>YTD units</span>
              </div>
            </div>
          ))}
        </div>
      </div>

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
                <th>Store</th>
                <th className="r">MTD Units</th>
                <th className="r">YTD Units</th>
                <th className="r">Front</th>
                <th className="r">Back</th>
                <th className="r">Total Gross</th>
                <th className="r">Avg / Deal</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.id} className={i < 3 ? "is-hot" : undefined}>
                  <td>
                    <span className={`da-demo-rank-pill${i < 3 ? " top" : ""}`}>#{i + 1}</span>
                  </td>
                  <td className="strong">{row.name}</td>
                  <td>{row.store}</td>
                  <td className="r">{row.mtdUnits.toFixed(1)}</td>
                  <td className="r">{row.ytdUnits.toFixed(1)}</td>
                  <td className="r">{currency(row.mtdFront)}</td>
                  <td className="r">{currency(row.mtdBack)}</td>
                  <td className="r strong">{currency(row.mtdTotal)}</td>
                  <td className="r">{currency(row.avgGross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="da-demo-split">
        <div className="da-demo-panel">
          <div className="da-demo-panel-head">
            <h3>2026 monthly volume</h3>
            <span>Booked units</span>
          </div>
          <div className="da-demo-bars">
            {monthlyTrend.map((m) => (
              <div key={m.month} className={`da-demo-bar-col${m.month === month ? " active" : ""}`}>
                <div
                  className="da-demo-bar"
                  style={{ height: `${Math.max(8, (m.units / maxUnits) * 120)}px` }}
                  title={`${m.units} units`}
                />
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="da-demo-panel">
          <div className="da-demo-panel-head">
            <h3>2026 monthly gross</h3>
            <span>Closed front + back</span>
          </div>
          <div className="da-demo-bars amber">
            {monthlyTrend.map((m) => (
              <div key={m.month} className={`da-demo-bar-col${m.month === month ? " active" : ""}`}>
                <div
                  className="da-demo-bar"
                  style={{ height: `${Math.max(8, (m.gross / maxGross) * 120)}px` }}
                  title={currency(m.gross)}
                />
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="da-demo-split">
        <div className="da-demo-panel">
          <div className="da-demo-panel-head">
            <h3>Department pace</h3>
            <span>Goal vs booked</span>
          </div>
          <div className="da-demo-table-scroll">
            <table className="da-demo-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Store</th>
                  <th className="r">Booked</th>
                  <th className="r">Goal</th>
                  <th className="r">Pace</th>
                  <th className="r">Gross</th>
                </tr>
              </thead>
              <tbody>
                {deptRows.map((row) => (
                  <tr key={row.id}>
                    <td className="strong">{row.name}</td>
                    <td>{row.store}</td>
                    <td className="r">{row.booked}</td>
                    <td className="r">{row.goal}</td>
                    <td className={`r ${row.pace >= row.goal ? "good" : "warn"}`}>
                      {row.pace.toFixed(0)}
                    </td>
                    <td className="r">{currency(row.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="da-demo-panel">
          <div className="da-demo-panel-head">
            <h3>Acquisition & finance mix</h3>
            <span>Closed deals this month</span>
          </div>
          <div className="da-demo-mix">
            <div>
              <div className="da-demo-mix-label">Sources</div>
              {sourceMix.slice(0, 6).map((s) => (
                <div key={s.name} className="da-demo-mix-row">
                  <div className="da-demo-mix-meta">
                    <span>{s.name}</span>
                    <b>{s.count}</b>
                  </div>
                  <div className="da-demo-mix-track">
                    <div style={{ width: `${(s.count / sourceMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="da-demo-mix-label">Finance</div>
              {financeMix.map((s) => (
                <div key={s.name} className="da-demo-mix-row">
                  <div className="da-demo-mix-meta">
                    <span>{s.name}</span>
                    <b>
                      {closed.length ? Math.round((s.count / closed.length) * 100) : 0}%
                    </b>
                  </div>
                  <div className="da-demo-mix-track blue">
                    <div
                      style={{
                        width: `${closed.length ? (s.count / closed.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="da-demo-insight">
            YTD closed deals in view: <b>{ytdDeals.filter((d) => isClosed(d.status)).length}</b> ·
            Use the Profit Center to turn this mix into a buy-box.
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  blue,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  blue?: boolean;
}) {
  return (
    <div className="da-demo-kpi">
      <div className="da-demo-kpi-label">{label}</div>
      <div className={`da-demo-kpi-value${accent ? " amber" : ""}${blue ? " blue" : ""}`}>
        {value}
      </div>
      <div className="da-demo-kpi-sub">{sub}</div>
    </div>
  );
}
