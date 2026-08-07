"use client";

import { useMemo, useState } from "react";
import {
  aggregateByDimension,
  type Dimension,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitTrade,
  type RollupRow,
} from "@/lib/profit-center/aggregate";
import { columnExtent, heatmapStyle } from "@/lib/profit-center/heatmap";
import {
  currency,
  type DemoFixture,
} from "@/lib/demo/acq-auto-group";

type Props = {
  fixture: DemoFixture;
  storeId: string;
  month: number;
};

type DemoDim = Dimension;

const DIMS: { id: DemoDim; label: string }[] = [
  { id: "model", label: "Make / Model" },
  { id: "price", label: "Price band" },
  { id: "acquisition", label: "Acquisition source" },
  { id: "department", label: "Department" },
  { id: "salesperson", label: "Salesperson" },
];

function signalFor(avgTotal: number | null, avgAge: number | null): {
  label: string;
  kind: "buy" | "watch" | "red";
} {
  const gross = avgTotal ?? 0;
  const age = avgAge ?? 40;
  if (gross >= 3200 && age <= 35) return { label: "BUY MORE", kind: "buy" };
  if (gross < 1200 || age >= 70) return { label: "RED-LIGHT", kind: "red" };
  return { label: "WATCH", kind: "watch" };
}

export function DemoProfitCenter({ fixture, storeId, month }: Props) {
  const [dim, setDim] = useState<DemoDim>("model");
  const [range, setRange] = useState<"month" | "ytd" | "all">("ytd");

  const selectedStoreIds =
    storeId === "all" ? fixture.stores.map((s) => s.id) : [storeId];

  const closedDeals = useMemo(() => {
    const monthPrefix = `2026-${String(month).padStart(2, "0")}`;
    return fixture.deals.filter((d) => {
      if (!selectedStoreIds.includes(d.store_id)) return false;
      if (d.status !== "closed" && d.status !== "delivered") return false;
      if (range === "month") return d.sale_date.startsWith(monthPrefix);
      if (range === "ytd") return d.sale_date.startsWith("2026-") && d.sale_date.slice(0, 7) <= monthPrefix;
      return d.sale_date.startsWith("2026-");
    });
  }, [fixture.deals, selectedStoreIds, month, range]);

  const profitDeals: ProfitDeal[] = useMemo(
    () =>
      closedDeals.map((d) => ({
        id: d.id,
        sale_date: d.sale_date,
        store_id: d.store_id,
        department_id: d.department_id,
        vehicle_year: d.vehicle_year,
        vehicle_make: d.vehicle_make,
        vehicle_model: d.vehicle_model,
        body_style: d.body_style,
        acquisition_source: d.acquisition_source,
        finance_type: d.finance_type,
        front_profit: d.front_profit,
        back_profit: d.back_profit,
        sale_price: d.sale_price,
        list_price: d.list_price,
        list_price_na: d.list_price_na,
        age: d.age,
        odometer: null,
      })),
    [closedDeals]
  );

  const tradesByDeal = useMemo(() => {
    const map = new Map<string, ProfitTrade[]>();
    for (const d of closedDeals) {
      if (!d.has_trade) continue;
      map.set(d.id, [
        {
          deal_id: d.id,
          acv: d.trade_acv,
          allowance: d.trade_allowance,
        },
      ]);
    }
    return map;
  }, [closedDeals]);

  const dealSalespeople: ProfitDealSalesperson[] = useMemo(
    () =>
      fixture.dealSalespeople
        .filter((a) => closedDeals.some((d) => d.id === a.deal_id))
        .map((a) => ({
          deal_id: a.deal_id,
          salesperson_id: a.salesperson_id,
          share_percent: a.share_percent,
        })),
    [fixture.dealSalespeople, closedDeals]
  );

  const salespersonNames = useMemo(
    () => new Map(fixture.salespeople.map((s) => [s.id, s.name])),
    [fixture.salespeople]
  );

  const deptNameById = useMemo(
    () => new Map(fixture.departments.map((d) => [d.id, d.name])),
    [fixture.departments]
  );

  const rows = useMemo((): RollupRow[] => {
    const { rows: rollups } = aggregateByDimension(dim, {
      deals: profitDeals,
      tradesByDeal,
      dealSalespeople,
      salespersonNames,
      departmentNames: deptNameById,
    });
    return rollups.filter((r) => !r.isTotal);
  }, [
    dim,
    profitDeals,
    tradesByDeal,
    dealSalespeople,
    salespersonNames,
    deptNameById,
  ]);

  const avgExtent = columnExtent(rows.map((r) => r.avgTotal));
  const ageExtent = columnExtent(rows.map((r) => r.avgAge));
  const volExtent = columnExtent(rows.map((r) => r.volume));

  const recommendations = useMemo(() => {
    const scored = rows
      .map((r) => ({ row: r, signal: signalFor(r.avgTotal, r.avgAge) }))
      .filter((x) => x.row.volume >= 4);
    const buys = scored
      .filter((x) => x.signal.kind === "buy")
      .sort((a, b) => (b.row.avgTotal ?? 0) - (a.row.avgTotal ?? 0))
      .slice(0, 4);
    const reds = scored
      .filter((x) => x.signal.kind === "red")
      .sort((a, b) => (a.row.avgTotal ?? 0) - (b.row.avgTotal ?? 0))
      .slice(0, 4);
    return { buys, reds };
  }, [rows]);

  const totalGross = closedDeals.reduce((s, d) => s + d.front_profit + d.back_profit, 0);
  const avgTurn =
    closedDeals.length === 0
      ? 0
      : closedDeals.reduce((s, d) => s + d.age, 0) / closedDeals.length;

  return (
    <div className="da-demo-view">
      <div className="da-demo-kpi-grid compact">
        <div className="da-demo-kpi">
          <div className="da-demo-kpi-label">Closed units in range</div>
          <div className="da-demo-kpi-value">{closedDeals.length}</div>
          <div className="da-demo-kpi-sub">Acquisition sample set</div>
        </div>
        <div className="da-demo-kpi">
          <div className="da-demo-kpi-label">Dept gross</div>
          <div className="da-demo-kpi-value amber">{currency(totalGross)}</div>
          <div className="da-demo-kpi-sub">Front + back</div>
        </div>
        <div className="da-demo-kpi">
          <div className="da-demo-kpi-label">Avg turn</div>
          <div className="da-demo-kpi-value blue">{avgTurn.toFixed(0)}d</div>
          <div className="da-demo-kpi-sub">Days to sale</div>
        </div>
        <div className="da-demo-kpi">
          <div className="da-demo-kpi-label">Buy signals</div>
          <div className="da-demo-kpi-value">{recommendations.buys.length}</div>
          <div className="da-demo-kpi-sub">
            {recommendations.reds.length} red-lights flagged
          </div>
        </div>
      </div>

      <div className="da-demo-buybox">
        <div>
          <div className="da-sec-eyebrow">Buy-box from your own deals</div>
          <h2>What to buy more of — and what to stop chasing</h2>
          <p>
            Profit Center grades every closed deal by gross and turn. High-gross, fast-turn
            segments become buy signals. Low-gross, slow-turn units become red-lights.
          </p>
        </div>
        <div className="da-demo-buybox-cols">
          <div>
            <div className="da-demo-buybox-title buy">Buy more</div>
            {recommendations.buys.length === 0 && <p className="muted">No strong buy signals yet.</p>}
            {recommendations.buys.map(({ row, signal }) => (
              <div key={row.key} className="da-demo-buybox-row">
                <div>
                  <b>{row.label}</b>
                  <span>
                    {row.volume} units · avg {currency(row.avgTotal ?? 0)} ·{" "}
                    {(row.avgAge ?? 0).toFixed(0)}d turn
                  </span>
                </div>
                <span className={`da-tag da-tag-buy`}>{signal.label}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="da-demo-buybox-title red">Red-light</div>
            {recommendations.reds.length === 0 && <p className="muted">No red-lights in this cut.</p>}
            {recommendations.reds.map(({ row, signal }) => (
              <div key={row.key} className="da-demo-buybox-row">
                <div>
                  <b>{row.label}</b>
                  <span>
                    {row.volume} units · avg {currency(row.avgTotal ?? 0)} ·{" "}
                    {(row.avgAge ?? 0).toFixed(0)}d turn
                  </span>
                </div>
                <span className={`da-tag da-tag-red`}>{signal.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="da-demo-panel">
        <div className="da-demo-panel-head wrap">
          <div>
            <h3>Acquisition intelligence</h3>
            <span>Heatmapped by gross and turn</span>
          </div>
          <div className="da-demo-chip-row">
            {(["month", "ytd", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`da-demo-chip${range === r ? " is-active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r === "month" ? "Selected month" : r === "ytd" ? "YTD" : "Full 2026"}
              </button>
            ))}
          </div>
        </div>

        <div className="da-demo-chip-row dims">
          {DIMS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`da-demo-chip${dim === d.id ? " is-active" : ""}`}
              onClick={() => setDim(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="da-demo-table-scroll">
          <table className="da-demo-table">
            <thead>
              <tr>
                <th>{DIMS.find((d) => d.id === dim)?.label}</th>
                <th className="r">Units</th>
                <th className="r">Avg Gross</th>
                <th className="r">Avg Turn</th>
                <th className="r">Total Gross</th>
                <th className="r">Avg Price</th>
                <th className="r">Signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((row) => {
                const signal = signalFor(row.avgTotal, row.avgAge);
                const grossStyle =
                  avgExtent && row.avgTotal != null
                    ? heatmapStyle(row.avgTotal, avgExtent.min, avgExtent.max, "higherBetter")
                    : undefined;
                const ageStyle =
                  ageExtent && row.avgAge != null
                    ? heatmapStyle(row.avgAge, ageExtent.min, ageExtent.max, "lowerBetter")
                    : undefined;
                const volStyle =
                  volExtent
                    ? heatmapStyle(row.volume, volExtent.min, volExtent.max, "higherBetter")
                    : undefined;
                return (
                  <tr key={row.key}>
                    <td className="strong">{row.label}</td>
                    <td className="r" style={volStyle}>
                      {row.volume}
                    </td>
                    <td className="r" style={grossStyle}>
                      {currency(row.avgTotal ?? 0)}
                    </td>
                    <td className="r" style={ageStyle}>
                      {(row.avgAge ?? 0).toFixed(0)}d
                    </td>
                    <td className="r">{currency(row.total)}</td>
                    <td className="r">{currency(row.avgSalePrice ?? 0)}</td>
                    <td className="r">
                      <span
                        className={`da-tag ${
                          signal.kind === "buy"
                            ? "da-tag-buy"
                            : signal.kind === "red"
                              ? "da-tag-red"
                              : "da-tag-watch"
                        }`}
                      >
                        {signal.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
